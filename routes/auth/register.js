const db = require("../../db");
const jwt = require("jwt-simple");
const {
  getUserFromGoogle,
  getUserFromUsername,
  checkUsername,
  checkEmail,
  encryptPassword,
} = require("../../utils/userutil");

// Sanitize input function
function sanitizeInput(input) {
  return input != undefined
    ? Number.isInteger(input)
      ? input
      : input
          .replace(/<script.*?>.*?<\/script>/gi, "")
          .replace(/<\/?[^>]+(>|$)/g, "")
          .trim()
    : undefined;
}

async function registerUser(req, res) {
  try {
    const today = new Date();
    const yyyy = today.getFullYear();
    let mm = today.getMonth() + 1; // month is zero-based
    let dd = today.getDate();

    if (dd < 10) dd = "0" + dd;
    if (mm < 10) mm = "0" + mm;

    const formatted = `${yyyy}-${mm}-${dd}`;
    const {
      username,
      password,
      uni_id,
      fac_id,
      major_id,
      std_id,
      cr_id,
      image,
      std_name,
      std_surname,
      phone,
      email,
      auth_reg_username,
      std_start_year,
    } = req.body;

    // Sanitize inputs
    const sanitizedUsername = sanitizeInput(username);
    const sanitizedPassword = password; // Hashing will handle security
    const sanitizedUniId = sanitizeInput(uni_id);
    const sanitizedFacId = sanitizeInput(fac_id);
    const sanitizedMajorId = sanitizeInput(major_id);
    const sanitizedStdId = sanitizeInput(std_id);
    const sanitizedCrId = sanitizeInput(cr_id);
    const sanitizedImage = sanitizeInput(image);
    const sanitizedStdName = sanitizeInput(std_name);
    const sanitizedStdSurname = sanitizeInput(std_surname);
    const sanitizedPhone = sanitizeInput(phone);
    const sanitizedEmail = sanitizeInput(email);
    const sanitizedAuthRegUsername = sanitizeInput(auth_reg_username);
    const sanitizedStdStartYear = sanitizeInput(std_start_year);

    const hashedPass = await encryptPassword(sanitizedPassword);
    await db.query(
      `INSERT INTO "public"."user_detail" ("username", "password", "uni_id", "fac_id", "major_id", "std_id", "cr_id", "image", "std_name", "std_surname", "phone", "email", "auth_reg_username", "create_at", "std_start_year") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15);`,
      [
        sanitizedUsername,
        hashedPass,
        sanitizedUniId,
        sanitizedFacId,
        sanitizedMajorId,
        sanitizedStdId,
        sanitizedCrId,
        sanitizedImage,
        sanitizedStdName,
        sanitizedStdSurname,
        sanitizedPhone,
        sanitizedEmail,
        sanitizedAuthRegUsername,
        formatted,
        sanitizedStdStartYear,
      ]
    );
    res != null ? res.json({ success: true }) : () => {};
    return true;
  } catch (error) {
    console.log(error);

    res != null
      ? res
          .status(400)
          .json({ success: false, error: error.code, msg: error.detail })
      : () => {};
    return false;
  }
}

async function updateFSUser(req, res) {
  try {
    const jwt_dc = jwt.decode(
      req.headers["authorization"],
      process.env.SECRET_JWT
    );
    const { uni_id, fac_id, major_id, std_id, cr_id, std_start_year } =
      req.body;

    // Sanitize inputs
    const sanitizedUniId = sanitizeInput(uni_id);
    const sanitizedFacId = sanitizeInput(fac_id);
    const sanitizedMajorId = sanitizeInput(major_id);
    const sanitizedStdId = std_id.length == 11 ? sanitizeInput(std_id) : "";
    const sanitizedCrId = sanitizeInput(cr_id);
    const sanitizedStdStartYear = sanitizeInput(std_start_year);

    await db.query(
      `UPDATE "public"."user_detail" SET "uni_id" = $1, fac_id = $2, "major_id" = $3, "std_id" = $4, "cr_id" = $5, "std_start_year" = $6 WHERE ${
        jwt_dc.email ? "email" : "username"
      } = $7;`,
      [
        sanitizedUniId,
        sanitizedFacId,
        sanitizedMajorId,
        sanitizedStdId,
        sanitizedCrId,
        sanitizedStdStartYear,
        jwt_dc.email ? jwt_dc.email : jwt_dc.user.username,
      ]
    );

    const result = jwt_dc.email
      ? await getUserFromGoogle(jwt_dc.email)
      : await getUserFromUsername(jwt_dc.user.username);
    res.json(result);
    return true;
  } catch (error) {
    console.error(error);
    res
      .status(400)
      .json({ success: false, error: error.code, msg: error.detail });
    return false;
  }
}

// The checkEmailUser and checkUsernameUser functions can also be sanitized similarly if needed.

async function checkEmailUser(req, res) {
  try {
    const { email } = req.body;
    if (email.trim() == "") {
      res.json(false);
      return false;
    }
    const sanitizedEmail = sanitizeInput(email.trim());
    const e = await checkEmail(sanitizedEmail);

    res.json(e);
    return e;
  } catch (error) {
    console.error(error);
    res
      .status(400)
      .json({ success: false, error: error.code, msg: error.detail });
    return false;
  }
}

async function checkUsernameUser(req, res) {
  try {
    const { username } = req.body;
    if (username.trim() == "") {
      res.json(false);
      return false;
    }
    const sanitizedUsername = sanitizeInput(username.trim());
    const e = await checkUsername(sanitizedUsername);

    res.json(e);
    return e;
  } catch (error) {
    console.error(error);
    res
      .status(400)
      .json({ success: false, error: error.code, msg: error.detail });
    return false;
  }
}

module.exports = {
  registerUser,
  updateFSUser,
  checkEmailUser,
  checkUsernameUser,
};
