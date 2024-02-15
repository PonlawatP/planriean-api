const db = require("../../db");

async function registerUser(req, res){
    try {
        const today = new Date();
        const yyyy = today.getFullYear();
        let mm = today.getMonth() + 1; // month is zero-based
        let dd = today.getDate();

        if (dd < 10) dd = '0' + dd;
        if (mm < 10) mm = '0' + mm;

        const formatted = yyyy + '-' + mm + '-' + dd;
        const {username, password, uni_id, fac_id, major_id, std_id, cr_id, email, img, std_name, std_surname, phone, auth_gg_email, auth_reg_username} = req.body
        await db.query(`INSERT INTO "public"."user_detail" ("username", "password", "uni_id", "fac_id", "major_id", "std_id", "cr_id", "email", "img", "std_name", "std_surname", "phone", "auth_gg_email", "auth_reg_username", "create_at") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15);`, [username, password, uni_id, fac_id, major_id, std_id, cr_id, email, img, std_name, std_surname, phone, auth_gg_email, auth_reg_username, formatted]);
        res.json({success: true});
    } catch (error) {
        res.status(400).json({success: false, error: error.code, msg: error.detail});
    }
}

module.exports = {
    registerUser
}