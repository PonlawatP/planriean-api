const db = require("../../db");
const jwt = require("jwt-simple");
const { registerUser } = require("./register");
const {
  getUserFromGoogle,
  getUserFromUsername,
  getUserFromAuthMSU,
  encryptPassword
} = require("../../utils/userutil");
const { getFacIdFromFacNameTh } = require("../../utils/universityutil");
const crypto = require('crypto');
const { createTransporter } = require("../../utils/mailutil");
const bcrypt = require('bcryptjs');

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

async function forgetPassword(req, res) {
  const { email } = req.body;
  const user = await getUserFromGoogle(email);
  if (user) {
    await sendOTP(email);
    res.json({ success: true, message: "OTP sent to email" });
  } else {
    res.status(404).json({ success: false, message: "User not found" });
  }
}

async function resendOTP(req, res) {
  const { email } = req.body;
  const user = await getUserFromGoogle(email);
  if (user) {
    await sendOTP(email);
    res.json({ success: true, message: "New OTP sent to email" });
  } else {
    res.status(404).json({ success: false, message: "User not found" });
  }
}

async function sendOTP(email) {
  // Generate OTP
  const otp = crypto.randomInt(100000, 999999).toString();

  // Hash the OTP
  const hashedOTP = await encryptPassword(otp);

  // Update user_detail table with new hashed OTP
  await db.query(
    'UPDATE user_detail SET otp = $1, otp_expires_at = $2, otp_created_at = CURRENT_TIMESTAMP WHERE email = $3',
    [hashedOTP, new Date(Date.now() + 3 * 60 * 1000), email]
  );


  // Send email with OTP
  // const mailOptions = {
  //   from: `"Planriean-NoReply" <${process.env.USER_EMAIL}>`,
  //   to: email,
  //   subject: 'รหัส OTP สำหรับรีเซ็ตรหัสผ่าน',
  //   html: `
  //     <p>รหัส OTP สำหรับรีเซ็ตรหัสผ่านของคุณคือ</p>
  //     <h2 style="font-size: 24px; font-weight: bold;">${otp}</h2>
  //     <p>รหัส OTP นี้จะหมดอายุใน 3 นาที</p>

  //     <p style="padding-top: 20px;">ข้อความนี้เป็นข้อความอัตโนมัติ กรุณาอย่าตอบกลับ</p>
  //   `
  // };
  const mailOptions = {
    from: `"Planriean-NoReply" <${process.env.USER_EMAIL}>`,
    to: email,
    subject: 'ยินดีต้อนรับสู่ครอบครัวแพลนเรียน',
    html: `
    <h1>ยินดีต้อนรับสู่ครอบครัวแพลนเรียน!</h1>
    <p>เราดีใจเป็นอย่างยิ่งที่คุณได้เข้าร่วมเป็นส่วนหนึ่งของชุมชนแพลนเรียนของเรา</p>
    <p>ตอนนี้คุณสามารถเข้าสู่ระบบและเริ่มใช้งานแพลตฟอร์มของเราได้แล้ว</p>
    <p style="padding-top: 20px;">ขอบคุณที่เลือกใช้แพลนเรียน เราหวังว่าคุณจะมีประสบการณ์ที่ดีกับเรา!</p>
    <p>ขอให้คุณมีความสุขกับการจัดตารางเรียน และประสบความสำเร็จในการศึกษาตลอดไป!</p>
    
    <p style="padding-top: 20px;">ข้อความนี้เป็นข้อความอัตโนมัติ กรุณาอย่าตอบกลับ</p>
    `
  };

  const transporter = await createTransporter();
  await transporter.sendMail(mailOptions);
}

async function verifyOTP(req, res) {
  const { email, otp } = req.body;

  // Get the stored hashed OTP
  const result = await db.query(
    'SELECT otp, otp_expires_at FROM user_detail WHERE email = $1 AND otp_expires_at > $2',
    [email, new Date()]
  );

  if (result.rows.length > 0) {
    const storedHashedOTP = result.rows[0].otp;
    const otpExpiresAt = result.rows[0].otp_expires_at;

    // Compare the provided OTP with the stored hashed OTP
    const isOTPValid = await bcrypt.compare(otp, storedHashedOTP);

    if (isOTPValid) {
      // If OTP is verified, extend its expiration time to 1 hour
      await db.query(
        'UPDATE user_detail SET otp_expires_at = $1 WHERE email = $2',
        [new Date(Date.now() + 60 * 60 * 1000), email]
      );

      res.json({ success: true, message: "OTP verified successfully" });
    } else {
      res.status(400).json({ success: false, message: "Invalid OTP" });
    }
  } else {
    res.status(400).json({ success: false, message: "Expired or non-existent OTP" });
  }
}

async function changePassword(req, res) {
  const { email, otp, newPassword } = req.body;

  // Get the stored hashed OTP
  const result = await db.query(
    'SELECT otp, otp_expires_at FROM user_detail WHERE email = $1 AND otp_expires_at > $2',
    [email, new Date()]
  );

  if (result.rows.length > 0) {
    const storedHashedOTP = result.rows[0].otp;

    // Compare the provided OTP with the stored hashed OTP
    const isOTPValid = await bcrypt.compare(otp, storedHashedOTP);

    if (isOTPValid) {
      // OTP is valid, update user's password
      const hashedPass = await encryptPassword(newPassword);

      await db.query(
        'UPDATE user_detail SET password = $1, otp = NULL, otp_expires_at = NULL WHERE email = $2',
        [hashedPass, email]
      );

      res.json({ success: true, message: "Password updated successfully" });
    } else {
      res.status(400).json({ success: false, message: "Invalid OTP" });
    }
  } else {
    res.status(400).json({ success: false, message: "Expired or non-existent OTP" });
  }
}

module.exports = {
  authToken,
  authGetUser,
  authFromToken,
  forgetPassword,
  resendOTP,
  verifyOTP,
  changePassword
};