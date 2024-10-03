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

      console.log(jwt_dc);

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
        } else {
          throw new Error("error");
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
