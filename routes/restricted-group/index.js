const db = require("../../db");
const { getUserFromToken } = require("../../utils/userutil");

async function getCourseRestrictGroups(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { uni_id } = req.params;
    if (user != null) {
      const result = await db.query(
        `SELECT
            courseset_restrictgrp.name_en,
            courseset_restrictgrp.name_th,
            courseset_restrictgrp.cr_restgrp_id,
            courseset_restrictgrp.std_year,
            courseset_restrictgrp.term,
            courseset_restrictgrp.create_at,
            courseset_detail.name_en as cr_name_en,
            courseset_detail.name_th as cr_name_th,
            courseset_detail.cr_key,
            courseset_detail.cr_id,
            -- Count of related records in restrictgrp_subject
            (SELECT COUNT(*) 
            FROM restrictgrp_subject 
            WHERE restrictgrp_subject.cr_restgrp_id = courseset_restrictgrp.cr_restgrp_id
            ) AS subject_count,
            -- Count of related records in restrictgrp_user
            (SELECT COUNT(*) 
            FROM restrictgrp_user 
            WHERE restrictgrp_user.cr_restgrp_id = courseset_restrictgrp.cr_restgrp_id
            ) AS user_count
        FROM
            courseset_restrictgrp
            JOIN courseset_detail ON courseset_restrictgrp.cr_id = courseset_detail.cr_id 
            AND courseset_restrictgrp.uni_id = courseset_detail.uni_id
        WHERE 
            courseset_restrictgrp.uni_id = $1;`,
        [uni_id]
      );

      res.json({
        data: result.rows,
      });
    } else {
      throw new Error("error!");
    }
  } catch (err) {
    console.error(err);
    res.status(404).send("Courseset Restriction Not Found");
  }
}

async function getCourseRestrictGroupData(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { uni_id, cr_restgrp_id } = req.params;
    if (user != null) {
      const result = await db.query(
        `SELECT
              courseset_restrictgrp.name_en,
              courseset_restrictgrp.name_th,
              cr_restgrp_id,
              std_year,
              term,
              create_at,
              courseset_detail.name_en as cr_name_en,
              courseset_detail.name_th as cr_name_th,
              cr_key,
              courseset_detail.cr_id
          FROM
              courseset_restrictgrp
              JOIN courseset_detail ON courseset_restrictgrp.cr_id = courseset_detail.cr_id 
              AND courseset_restrictgrp.uni_id = courseset_detail.uni_id
          WHERE courseset_restrictgrp.uni_id = $1 AND courseset_restrictgrp.cr_restgrp_id = $2;`,
        [uni_id, cr_restgrp_id]
      );
      if (result.rows.length != 0) {
        const data = result.rows[0];
        const result_subjects = await db.query(
          `SELECT
                restrictgrp_subject.suj_id,
                sec,
                suj_name_en,
                suj_name_th 
            FROM
                restrictgrp_subject
                JOIN courseset_subject ON restrictgrp_subject.suj_id = courseset_subject.suj_id 
                AND cr_id = $1 
            WHERE
                cr_restgrp_id = $2`,
          [data.cr_id, cr_restgrp_id]
        );
        const result_users = await db.query(
          `SELECT 
            std_id
            FROM
                restrictgrp_user
            WHERE
                cr_restgrp_id = $1`,
          [cr_restgrp_id]
        );

        res.json({
          data: {
            ...data,
            subject_count: result_subjects.rowCount,
            user_count: result_users.rowCount,
          },
          subjects: result_subjects.rows,
          users: result_users.rows.flatMap((f) => f.std_id),
        });
      } else {
        throw new Error("error!");
      }
    } else {
      throw new Error("error!");
    }
  } catch (err) {
    console.error(err);
    res.status(404).send("Courseset Restriction Not Found");
  }
}

async function a_addCourseRestrictGroupUsers(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { uni_id, cr_restgrp_id } = req.params;
    const { users } = req.body; // Assuming you pass an array of user IDs in the request body

    if (user != null) {
      // You might want to add authorization checks here to ensure the user has the right to add users

      // Use a transaction to ensure all inserts are successful
      await db.query("BEGIN");

      for (const std_id of users) {
        const preInsertResult = await db.query(
          `SELECT * FROM restrictgrp_user WHERE cr_restgrp_id = $1 AND std_id = $2;`, // Prevent duplicate entries
          [cr_restgrp_id, std_id]
        );
        if (preInsertResult.rowCount != 0) {
          // Handle the case where insertion failed (e.g., due to constraint violation)
          await db.query("ROLLBACK");
          return res.status(500).json({
            success: false,
            message: `Failed to add user ${std_id} to restriction group ${cr_restgrp_id}`,
          });
        }

        await db.query(
          `INSERT INTO restrictgrp_user (cr_restgrp_id, std_id) 
             VALUES ($1, $2);`, // Prevent duplicate entries
          [cr_restgrp_id, std_id]
        );
      }

      await db.query("COMMIT");

      res.status(201).json({
        success: true,
        message: "Users added to restriction group successfully",
      });
    } else {
      throw new Error("User not authenticated");
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Failed to add users to restriction group",
    });
  }
}

async function a_removeCourseRestrictGroupUsers(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { uni_id, cr_restgrp_id } = req.params;
    const { users } = req.body; // Array of user IDs to remove

    if (user != null) {
      // Authorization checks here

      const deleteResult = await db.query(
        `DELETE FROM restrictgrp_user 
           WHERE cr_restgrp_id = $1 AND std_id = ANY($2);`,
        [cr_restgrp_id, users]
      );

      if (deleteResult.rowCount > 0) {
        res.status(200).json({
          success: true,
          message: "Users removed from restriction group successfully",
        });
      } else {
        res.status(404).json({
          success: false,
          message: "No matching users found in the restriction group",
        });
      }
    } else {
      throw new Error("User not authenticated");
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Failed to remove users from restriction group",
    });
  }
}

async function a_updateCourseRestrictGroupUsers(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { uni_id, cr_restgrp_id } = req.params;
    const { users } = req.body; // Array of user IDs to update

    if (user != null) {
      // Authorization checks here

      // You'll likely want to define what "update" means in this context.
      // For example, you might:
      // 1. Delete all existing users for the group and insert the new list.
      // 2. Find the differences between the existing list and the new list,
      //    then perform insertions and deletions accordingly.

      // For simplicity, let's assume you want to replace the entire list:

      await db.query("BEGIN");

      // Delete existing users
      await db.query("DELETE FROM restrictgrp_user WHERE cr_restgrp_id = $1", [
        cr_restgrp_id,
      ]);

      // Insert the new list of users
      for (const std_id of users) {
        const insertResult = await db.query(
          `INSERT INTO restrictgrp_user (cr_restgrp_id, std_id) 
             VALUES ($1, $2)`,
          [cr_restgrp_id, std_id]
        );

        if (insertResult.rowCount === 0) {
          await db.query("ROLLBACK");
          return res.status(500).json({
            success: false,
            message: `Failed to update user ${std_id} for restriction group ${cr_restgrp_id}`,
          });
        }
      }

      await db.query("COMMIT");

      res.status(200).json({
        success: true,
        message: "Restriction group users updated successfully",
      });
    } else {
      throw new Error("User not authenticated");
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Failed to update restriction group users",
    });
  }
}

async function a_addCourseRestrictGroupSubjects(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { uni_id, cr_restgrp_id } = req.params;
    const { subjects } = req.body; // Assuming an array of subject objects in the request body

    if (user != null) {
      // Authorization checks here

      await db.query("BEGIN");

      for (const subject of subjects) {
        const preInsertResult = await db.query(
          `SELECT * FROM restrictgrp_subject WHERE cr_restgrp_id = $1 AND suj_id = $2 AND sec = $3;`, // Prevent duplicate entries
          [cr_restgrp_id, subject.suj_id, subject.sec]
        );
        if (preInsertResult.rowCount != 0) {
          await db.query("ROLLBACK");
          return res.status(500).json({
            success: false,
            message: `Failed to add subject ${subject.suj_id} (sec: ${subject.sec}) to restriction group ${cr_restgrp_id}`,
          });
        }

        // Assuming your subject object has suj_id and sec properties
        await db.query(
          `INSERT INTO restrictgrp_subject (cr_restgrp_id, suj_id, sec) 
             VALUES ($1, $2, $3);`, // Prevent duplicates
          [cr_restgrp_id, subject.suj_id, subject.sec]
        );
      }

      await db.query("COMMIT");

      res.status(201).json({
        success: true,
        message: "Subjects added to restriction group successfully",
      });
    } else {
      throw new Error("User not authenticated");
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Failed to add subjects to restriction group",
    });
  }
}

async function a_removeCourseRestrictGroupSubjects(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { uni_id, cr_restgrp_id } = req.params;
    const { subjects } = req.body; // Array of subject objects to remove

    if (user != null) {
      // Authorization checks here

      // Build a WHERE clause for deleting specific subjects and sections
      const whereClauses = subjects
        .map(
          (subject, index) =>
            `(suj_id = $${index * 2 + 1} AND sec = $${index * 2 + 2})`
        )
        .join(" OR ");

      const deleteResult = await db.query(
        `DELETE FROM restrictgrp_subject 
           WHERE cr_restgrp_id = $${
             subjects.length * 2 + 1
           } AND (${whereClauses});`,
        [...subjects.flatMap((s) => [s.suj_id, s.sec]), cr_restgrp_id]
      );

      if (deleteResult.rowCount > 0) {
        res.status(200).json({
          success: true,
          message: "Subjects removed from restriction group successfully",
        });
      } else {
        res.status(404).json({
          success: false,
          message: "No matching subjects found in the restriction group",
        });
      }
    } else {
      throw new Error("User not authenticated");
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Failed to remove subjects from restriction group",
    });
  }
}

async function a_updateCourseRestrictGroupSubjects(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { uni_id, cr_restgrp_id } = req.params;
    const { subjects } = req.body; // Array of subject objects to update

    if (user != null) {
      // Authorization checks here

      // Assuming you want to replace the entire list of subjects:

      await db.query("BEGIN");

      // Delete existing subjects
      await db.query(
        "DELETE FROM restrictgrp_subject WHERE cr_restgrp_id = $1",
        [cr_restgrp_id]
      );

      // Insert the new list of subjects
      for (const subject of subjects) {
        const insertResult = await db.query(
          `INSERT INTO restrictgrp_subject (cr_restgrp_id, suj_id, sec) 
             VALUES ($1, $2, $3)`,
          [cr_restgrp_id, subject.suj_id, subject.sec]
        );

        if (insertResult.rowCount === 0) {
          await db.query("ROLLBACK");
          return res.status(500).json({
            success: false,
            message: `Failed to update subject ${subject.suj_id} (sec: ${subject.sec}) for restriction group ${cr_restgrp_id}`,
          });
        }
      }

      await db.query("COMMIT");

      res.status(200).json({
        success: true,
        message: "Restriction group subjects updated successfully",
      });
    } else {
      throw new Error("User not authenticated");
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Failed to update restriction group subjects",
    });
  }
}

module.exports = {
  getCourseRestrictGroups,
  getCourseRestrictGroupData,
  a_addCourseRestrictGroupUsers,
  a_removeCourseRestrictGroupUsers,
  a_updateCourseRestrictGroupUsers,
  a_addCourseRestrictGroupSubjects,
  a_removeCourseRestrictGroupSubjects,
  a_updateCourseRestrictGroupSubjects,
};
