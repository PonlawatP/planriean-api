const db = require("../../db");
const jwt = require("jwt-simple");
const { registerUser } = require("./register");
const {
  getUserFromGoogle,
  getUserFromUsername,
} = require("../../utils/userutil");

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
    // console.log(jwt_dc)

    console.log(jwt_dc);

    // const user = jwt_dc.sub
    let result = await getUserFromGoogle(jwt_dc.email);

    if (result == null) {
      const bd = {
        body: {
          username: null,
          password: null,
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
          auth_gg_email: jwt_dc.email,
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
    res.status(403).send("Invalid Token");
  }
}

async function authGetUser(req, res) {
  try {
    const jwt_dc = jwt.decode(
      req.headers["authorization"],
      process.env.SECRET_JWT
    );
    let result = null;

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
      res.status(404).send("No User Found");
    }
  } catch (err) {
    console.error(err);
    res.status(403).send("Invalid Input");
  }
}

module.exports = {
  authToken,
  authGetUser,
  authFromToken,
};
