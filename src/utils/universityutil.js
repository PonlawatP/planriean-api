const db = require("../db");

async function getFacIdFromFacNameTh(uniId, facNameTh) {
    try {
        const result = await db.query(
            "SELECT fac_id FROM university_faculty WHERE uni_id = $1 AND LOWER(fac_name_th) = LOWER($2)",
            [uniId, facNameTh]
        );

        if (result.rows.length > 0) {
            return result.rows[0].fac_id;
        } else {
            return null;
        }
    } catch (error) {
        console.error("Error in getFacIdFromFacNameTh:", error);
        throw error;
    }
}

module.exports = {
    getFacIdFromFacNameTh,
};
