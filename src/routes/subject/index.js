const db = require("../../db");
const redis = require("../../redis");
const { getCurrentSeason } = require("../../utils/seasonutil");
const { getUserFromToken } = require("../../utils/userutil");


const getSubjectReviewByRealId = async (req, res) => {
    const { uni_id, suj_id } = req.params;
    const review = await db.query("SELECT subject_review.*, user_detail.username, concat(std_name, ' ', std_surname) AS std_name, user_detail.image FROM subject_review LEFT JOIN user_detail ON subject_review.uid = user_detail.uid WHERE subject_review.uni_id = $1 AND subject_review.suj_real_code = $2", [uni_id, suj_id]);

    const user = await getUserFromToken(req);

    const sum_term = await db.query("SELECT code, year, semester, sec, lecturer FROM course_detail WHERE uni_id = $1 AND suj_real_code = $2", [uni_id, suj_id]);

    const own_review = user == undefined ? undefined : review.rows.find(review => review.uid == user.uid);
    const pre_review_owned = user == undefined ? null : { ...own_review, sec_detail: own_review == undefined ? undefined : sum_term.rows.find(term => term.semester == own_review.std_semester && term.year == own_review.std_year && term.sec == own_review.sec) };
    const review_owned = pre_review_owned == null || pre_review_owned.sec_detail == undefined ? null : {
        ...pre_review_owned,
        uid: undefined,
        image: undefined,
        user: {
            anonymous: pre_review_owned.anonymous,
            uid: pre_review_owned.uid,
            username: pre_review_owned.username,
            name: pre_review_owned.std_name,
            image: pre_review_owned.image
        }

    };

    const data = {
        review_owned,
        data: review.rows.map(row => ({
            ...row,
            uid: undefined,
            image: undefined,
            sec_detail: sum_term.rows.find(term => term.semester == row.std_semester && term.year == row.std_year && term.sec == row.sec),
            user: {
                anonymous: row.anonymous,
                uid: row.anonymous == true ? null : row.uid,
                username: row.anonymous == true ? null : row.username,
                name: row.anonymous == true ? null : row.std_name,
                image: row.anonymous == true ? null : row.image
            }
        }))
    }

    if (res != null) {
        res.json({
            success: true,
            ...data
        });
    } else {
        return data;
    }
}


const getSubjectDetail = async (req, res) => {
    const { uni_id, suj_id } = req.params;
    const { semester = null, year = null } = req.query;
    const user = await getUserFromToken(req);

    const result_updated = await db.query(
        `SELECT LOWER(uni_key) as uni_key, to_char(
            refresh_updated_at + interval '543 years',
            'DD/MM/YY HH24:MI:SS'
        ) AS formatted_date FROM university_detail WHERE uni_id = $1`,
        [uni_id]
    );

    const uni_key = result_updated.rows[0].uni_key;

    // Create cache key
    const cacheKey = `planriean-${uni_key}:subject:${suj_id}:${year || 'no_y'}-${semester || 'no_sme'}`;

    const review = await getSubjectReviewByRealId(req, null);

    // Check if cache is valid
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
        return res.json({
            success: true,
            cached: true,
            subject: JSON.parse(cachedData),
            reviews: review.data,
            review_owned: review.review_owned
        });
    }

    const subject = await db.query("SELECT * FROM courseset_subject WHERE uni_id = $1 AND suj_real_id = $2 LIMIT 1", [uni_id, suj_id]);
    // console.log(subject.rows);
    const faculty = await db.query(
        "SELECT fac_id, fac_key, fac_name_th, fac_name_en FROM university_faculty WHERE uni_id = $1 AND fac_id = $2",
        [subject.rows[0].uni_id, subject.rows[0].fac_id]
    );

    // Split the prerequisite string into an array
    const preReqIds = subject.rows[0].suj_pre_req ? subject.rows[0].suj_pre_req.split(',') : [];
    // Query prerequisites if there are any
    const pre_req = preReqIds.length > 0
        ? await db.query(
            "SELECT * FROM courseset_subject WHERE cr_id = $1 AND uni_id = $2 AND suj_id = ANY($3::text[])",
            [subject.rows[0].cr_id, uni_id, preReqIds]
        )
        : { rows: [] };

    const suj_exam = year == null || semester == null ? { exam_mid: null, exam_final: null } : (await db.query("SELECT exam_mid, exam_final FROM course_detail WHERE uni_id = $1 AND suj_real_code = $2 AND semester = $3 AND year = $4 LIMIT 1", [uni_id, suj_id, semester, year])).rows[0];

    const sum_term = await db.query("SELECT code, year, semester, sec, lecturer as sum_term FROM course_detail WHERE uni_id = $1 AND suj_real_code = $2", [uni_id, suj_id]);

    const seasons = await db.query(`
        SELECT
          YEAR,
          seamster_round,
          ss_round,
          std_year,
          ss_start,
          ss_end 
        FROM
          seamster_detail
          LEFT JOIN seamster_rounding ON seamster_detail.seamster_id = seamster_rounding.seamster_id 
        WHERE
          uni_id = $1
        ORDER BY
          ss_start;
        `, [uni_id]);

    const current_seasons = getCurrentSeason(seasons.rows, new Date().toISOString());
    const sum_terms = sum_term.rows.reduce((acc, row) => {
        const term = `${row.semester}/${row.year}`;
        const existingTerm = acc.find(t => t.term === term);

        if (existingTerm) {
            existingTerm.secs.push({
                sec: row.sec,
                lecturer: row.sum_term
            });
        } else {
            acc.push({
                term,
                _year: row.year,
                _semester: row.semester,
                secs: [{
                    sec: row.sec,
                    lecturer: row.sum_term
                }]
            });
        }
        return acc;
    }, []).filter(term => term._year < current_seasons.year || (term._year == current_seasons.year && term._semester <= current_seasons.semester)).map(term => ({
        ...term,
        _year: undefined,
        _semester: undefined,
        current: term._year == current_seasons.year && term._semester == current_seasons.semester
    }));

    const subject_data = {
        ...subject.rows[0],
        fac_id: undefined,
        suj_pre_req: pre_req.rows,
        faculty: faculty.rowCount == 0 ? null : { ...faculty.rows[0] },
        suj_exam,
        sum_terms,
        current_seasons
    }

    res.json({
        success: true,
        cached: false,
        subject: subject_data,
        reviews: review.data,
        review_owned: review.review_owned
    });

    // Store in Redis cache
    try {
        const pipeline = redis.pipeline();
        pipeline.set(cacheKey, JSON.stringify(subject_data), 'EX', 60 * 60); // Cache for 1 hour
        await pipeline.exec();
    } catch (redisError) {
        console.error('Redis pipeline failed:', redisError);
    }
}

async function a_addSubjectReview(req, res) {
    const { uni_id, suj_id } = req.params;
    const user = await getUserFromToken(req);
    const { content, images = [], rate, term, sec } = req.body;

    const validate = validateReviewInput(req.body);
    if (!validate.valid) {
        return res.status(400).json({
            success: false,
            message: validate.message
        });
    }

    // Parse term into semester and year
    const [semester, year] = term.split('/');

    // await new Promise(resolve => setTimeout(resolve, 2000));
    // res.status(201).json({
    //     success: true,
    //     message: "เพิ่มรีวิวแล้ว",
    //     review_id: -1
    // });
    // return

    try {
        // Insert the new review
        const insertResult = await db.query(
            `INSERT INTO subject_review (
                uid, uni_id, suj_real_code, content, images, 
                std_semester, std_year, created_at, updated_at, 
                flag, badge, rate, sec
            ) VALUES (
                $1, $2, $3, $4, $5, 
                $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
                '{}', '{}', $8, $9
            ) RETURNING review_id`,
            [
                user.uid,
                uni_id,
                suj_id,
                content,
                JSON.stringify(images),
                semester,
                year,
                rate,
                sec
            ]
        );

        if (insertResult.rowCount > 0) {
            res.status(201).json({
                success: true,
                message: "รีวิวของคุณถูกเพิ่มแล้ว",
                review_id: insertResult.rows[0].review_id
            });
        } else {
            res.status(500).json({
                success: false,
                message: "เพิ่มรีวิวไม่ได้"
            });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: "เพิ่มรีวิวไม่ได้"
        });
    }
}

async function a_editSubjectReview(req, res) {
    const { uni_id, suj_id } = req.params;
    const user = await getUserFromToken(req);
    const { content, images = [], rate, term, sec } = req.body;

    const validate = validateReviewInput(req.body);
    if (!validate.valid) {
        return res.status(400).json({
            success: false,
            message: validate.message
        });
    }

    // Parse term into semester and year
    const [semester, year] = term.split('/');

    try {
        const updateResult = await db.query(
            `UPDATE subject_review 
             SET content = $1,
                 images = $2,
                 std_semester = $3,
                 std_year = $4,
                 updated_at = CURRENT_TIMESTAMP,
                 rate = $5,
                 sec = $6
             WHERE uid = $7 
             AND uni_id = $8 
             AND suj_real_code = $9
             RETURNING review_id`,
            [
                content,
                JSON.stringify(images),
                semester,
                year,
                rate,
                sec,
                user.uid,
                uni_id,
                suj_id
            ]
        );

        if (updateResult.rowCount > 0) {
            res.status(200).json({
                success: true,
                message: "รีวิวของคุณถูกแก้ไขแล้ว",
                review_id: updateResult.rows[0].review_id
            });
        } else {
            res.status(404).json({
                success: false,
                message: "ไม่พบรีวิวของคุณ"
            });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: "แก้ไขรีวิวไม่ได้"
        });
    }
}

async function a_deleteSubjectReview(req, res) {
    const { uni_id, suj_id } = req.params;
    const user = await getUserFromToken(req);

    try {
        const deleteResult = await db.query(
            `DELETE FROM subject_review 
             WHERE uid = $1 AND uni_id = $2 AND suj_real_code = $3
             RETURNING review_id`,
            [user.uid, uni_id, suj_id]
        );

        if (deleteResult.rowCount > 0) {
            res.status(200).json({
                success: true,
                message: "รีวิวของคุณถูกลบเรียบร้อย"
            });
        } else {
            res.status(404).json({
                success: false,
                message: "ไม่พบรีวิวของคุณ"
            });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: "ลบรีวิวไม่ได้"
        });
    }
}

const validateReviewInput = (body) => {
    const { rate, term, sec, content, images } = body;

    if (!content) {
        return {
            valid: false,
            message: "กรุณากรอกเนื้อหารีวิว"
        };
    }

    // Validate content length (must not exceed 1000 characters)
    if (content.length > 1000) {
        return {
            valid: false,
            message: "เนื้อหารีวิวต้องไม่เกิน 1000 ตัวอักษร"
        };
    }

    // Validate rate (must be 1-5)
    if (!Number.isInteger(rate) || rate < 0 || rate > 5) {
        return {
            valid: false,
            message: "คะแนนต้องอยู่ระหว่าง 0-5"
        };
    }

    // Validate term format if provided (must be x/xxxx)
    if (term !== null && term !== undefined) {
        const termRegex = /^\d{1}\/\d{4}$/;
        if (!termRegex.test(term)) {
            return {
                valid: false,
                message: "รูปแบบเทอมไม่ถูกต้อง (เช่น 1/2567)"
            };
        }
    }

    // Validate sec if provided (must be positive integer)
    if (sec !== null && sec !== undefined) {
        if (!Number.isInteger(sec) || sec < 1) {
            return {
                valid: false,
                message: "กลุ่มเรียนต้องเป็นตัวเลขที่มากกว่า 0"
            };
        }
    }

    // Validate content (must not be empty after removing HTML tags)
    const strippedContent = content.replace(/<[^>]*>/g, '').trim();
    if (strippedContent.length === 0) {
        return {
            valid: false,
            message: "กรุณากรอกเนื้อหารีวิว"
        };
    }

    // Validate images array (must be array of strings)
    if (images && (!Array.isArray(images) || !images.every(img => typeof img === 'string'))) {
        return {
            valid: false,
            message: "รูปภาพต้องเป็น array ของ URL"
        };
    }

    return { valid: true };
};

module.exports = {
    getSubjectDetail,
    getSubjectReviewByRealId,
    a_addSubjectReview,
    a_editSubjectReview,
    a_deleteSubjectReview
}