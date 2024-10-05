const db = require("../../db");
const jwt = require("jwt-simple");
const { registerUser } = require("./register");
const {
  getUserFromGoogle,
  getUserFromUsername,
  getUserFromAuthMSU
} = require("../../utils/userutil");
const { getFacIdFromFacNameTh } = require("../../utils/universityutil");

async function authToken(req, res) {
  const payload = {
    sub: req.body.username,
    iat: new Date().getTime(), //มาจากคำว่า issued at time (สร้างเมื่อ)
  };
  res.json({ token: jwt.encode(payload, process.env.SECRET_JWT) });
}

async function authFromToken(req, res) {
  try {
    const jwt_dc = jwt.decode(
      req.headers["authorization"],
      process.env.SECRET_JWT
    );

    // console.log(jwt_dc);
    let result;

    if ((req.headers["gateway"] || "normal").toLowerCase() == "auth-msu") {
      result = await getUserFromAuthMSU(jwt_dc.student_id);

      // console.log(jwt_dc);

      if (result == null) {
        const bd = {
          body: {
            username: null,
            password: "null",
            uni_id: 1,
            fac_id: await getFacIdFromFacNameTh(1, jwt_dc.facualty_th),
            major_id: null,
            std_id: jwt_dc.student_id,
            cr_id: jwt_dc.course_id,
            email: null,
            image: jwt_dc.picture,
            std_name: jwt_dc.name_en.split(" ")[0],
            std_surname: jwt_dc.name_en.split(" ")[jwt_dc.name_en.split(" ").length - 1],
            phone: null,
            email: null,
            auth_reg_username: jwt_dc.student_id,
            std_start_year: jwt_dc.start_educated_date.split("/")[2],
          },
        };

        const is_registered = await registerUser(bd, null);

        if (is_registered) {
          result = await getUserFromAuthMSU(jwt_dc.student_id);


          const getHistory = await fetch(process.env.AUTH_MSU_ENDPOINT + '/user/graduated', {
            method: 'GET',
            headers: { "Content-Type": "application/json", 'Authorization': 'Bearer ' + jwt_dc.token }
          });
          const subjs = await getHistory.json();

          // console.log(result, subjs);

          const subj_sql = [];
          for (const subj of subjs.result) {
            for (const subj_try of subj.learning_try) {
              subj_sql.push({
                uid: result.user.uid,
                subj_id: subj.code,
                study_term: subj_try.semester,
                study_year: subj_try.year,
                grade: subj_try.grade,
                score: subj.current_score,
                uni_id: 1,
              });
            }
          }
          // reset ข้อมูลรายวิชาในแผนเรียนนั้นก่อนทำขั้นตอนต่อไป
          await db.query(`DELETE FROM user_subjecthistory WHERE uid = $1;`, [
            result.user.uid,
          ]);
          if (subj_sql.length == 0) {
            return res.json(result);
          }
          // เอาข้อมูลบางส่วนที่ไม่ได้ส่งมากับ body ยัดใส่ก่อนสร้าง sql placeholder
          const sql_placeholders = subj_sql
            .map(
              (_, i) =>
                `(${Object.keys(subj_sql[0])
                  .map((_, j) => `$${i * Object.keys(subj_sql[0]).length + j + 1}`)
                  .join(",")})`
            )
            .join(",");
          // console.log(sql_placeholders);
          const insertQuery = `
                INSERT INTO "user_subjecthistory" (uid, subj_id, study_term, study_year, grade, score, uni_id)
                VALUES ${sql_placeholders}
            ;`;
          const values = subj_sql.flatMap((subject) => [
            subject.uid,
            subject.subj_id,
            subject.study_term,
            subject.study_year,
            subject.grade,
            subject.score,
            subject.uni_id,
          ]);
          // ยัดข้อมูลลง database
          await db.query(insertQuery, values);

        }
      }

      return res.json(result);
    }


    if (jwt_dc.sub) {
      result = await getUserFromUsername(jwt_dc.sub);
      res.json(result);
      return;
    }
    // const user = jwt_dc.sub
    result = await getUserFromGoogle(jwt_dc.email);

    if (result == null) {
      const bd = {
        body: {
          username: null,
          password: "null",
          uni_id: null,
          fac_id: null,
          major_id: null,
          std_id: null,
          cr_id: null,
          email: null,
          image: jwt_dc.picture,
          std_name: jwt_dc.name.split(" ")[0],
          std_surname: jwt_dc.name.split(" ")[1],
          phone: null,
          email: jwt_dc.email,
          auth_reg_username: null,
        },
      };
      const is_registered = await registerUser(bd, null);

      if (is_registered) {
        result = await getUserFromGoogle(jwt_dc.email);
      } else {
        throw new Error("error");
      }
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(403).json({ message: "Invalid Token" });
  }
}

async function authGetUser(req, res) {
  try {
    const jwt_dc = jwt.decode(
      req.headers["authorization"],
      process.env.SECRET_JWT
    );
    let result = null;
    // console.log(jwt_dc);

    if (jwt_dc.email) {
      const email = jwt_dc.email;
      result = await getUserFromGoogle(email);
    } else {
      const user = jwt_dc.sub;
      result = await getUserFromUsername(user);
    }

    if (result != null) {
      res.json(result);
    } else {
      res.status(404).json({ message: "No User Found" });
    }
  } catch (err) {
    console.error(err);
    res.status(403).json({ message: "Invalid Input" });
  }
}

module.exports = {
  authToken,
  authGetUser,
  authFromToken,
};
