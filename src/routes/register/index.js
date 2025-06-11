const db = require("../../db");
const { getUserFromRequest } = require("../../utils/userutil");

async function getRegisterIntevals(req, res) {
  try {
    const user = await getUserFromRequest(req);
    const { uni_id } = req.params;

    if (user != null) {
      const result = await db.query(
        `SELECT 
          YEAR,
          seamster_round,
          seamster_detail.seamster_id,
          ss_round,
          ss_start,
          ss_end,
          std_year 
        FROM
          seamster_detail
        LEFT JOIN seamster_rounding on seamster_detail.seamster_id = seamster_rounding.seamster_id 
        WHERE uni_id = $1;`,
        [uni_id]
      );

      let groupedData = result.rows.reduce((acc, curr) => {
        let existingYear = acc.find((item) => item.year === curr.year);
        if (!existingYear) {
          existingYear = { year: curr.year, semesters: [] };
          acc.push(existingYear);
        }

        let existingSemester = existingYear.semesters.find(
          (item) =>
            item.round === curr.seamster_round &&
            item.semester_id === curr.seamster_id
        );
        if (!existingSemester) {
          existingSemester = {
            round: curr.seamster_round,
            semester_id: curr.seamster_id,
            timelines: [],
          };
          existingYear.semesters.push(existingSemester);
        }

        let existingSubRound = existingSemester.timelines.find(
          (item) => item.sub_round === curr.ss_round
        );
        if (!existingSubRound && curr.ss_round != null) {
          existingSubRound = {
            sub_round: curr.ss_round,
            std_years: [],
          };
          existingSemester.timelines.push(existingSubRound);
        }

        if (curr.std_year != null) {
          existingSubRound.std_years.push({
            std_year: curr.std_year,
            sub_start: curr.ss_start,
            sub_end: curr.ss_end,
          });
        }

        return acc;
      }, []);

      groupedData.sort((a, b) => b.year - a.year);

      // Sort semesters within each year by round (descending)
      groupedData.forEach((year) => {
        year.semesters.sort((a, b) => a.round - b.round);

        // Sort timelines within each semester by sub_round (descending)
        year.semesters.forEach((semester) => {
          semester.timelines.sort((a, b) => a.sub_round - b.sub_round);

          semester.timelines.forEach((timeline) => {
            timeline.std_years.sort((a, b) => b.std_year - a.std_year);
          });
        });
      });

      res.json({
        // data: result.rows,
        data: groupedData,
      });
    } else {
      throw new Error("error!");
    }
  } catch (err) {
    console.error(err);
    res.status(404).send("Courseset Restriction Not Found");
  }
}
async function a_manageRegisterYear(req, res) {
  try {
    const user = await getUserFromRequest(req);

    if (user != null) {
      const { uni_id } = req.params; // For edit, uni_id is required in the URL
      const { year } = req.body; // Year to add or update

      if (req.method === "POST") {
        // Add new year
        // Check if the year already exists
        const existsResult = await db.query(
          "SELECT 1 FROM seamster_detail WHERE uni_id = $1 AND year = $2",
          [uni_id, year]
        );

        if (existsResult.rows.length > 0) {
          return res.json({
            success: false,
            message: "Year already exists for this university.",
          });
        }

        // If year doesn't exist, proceed with adding it (you'll need to define the logic for this)

        await db.query(
          "INSERT INTO seamster_detail(year,uni_id,seamster_round) VALUES ($1,$2,$3);",
          [year, uni_id, 1]
        );

        return res.json({
          success: true,
          message: "Year added successfully.",
        });
      } else if (req.method === "PUT") {
        // Edit existing year
        const { oldYear } = req.params; // Get the old year from the URL

        // Check if the year to update exists
        const yearExistsResult = await db.query(
          "SELECT 1 FROM seamster_detail WHERE uni_id = $1 AND year = $2",
          [uni_id, oldYear]
        );

        if (yearExistsResult.rows.length === 0) {
          return res.json({
            success: false,
            message: "Year not found for this university.",
          });
        }

        // Update the year in the database
        await db.query(
          "UPDATE seamster_detail SET year = $1 WHERE uni_id = $2 AND year = $3",
          [year, uni_id, oldYear]
        );

        return res.json({
          success: true,
          message: "Year updated successfully.",
        });
      } else if (req.method === "DELETE") {
        // Edit existing year
        const { oldYear } = req.params; // Get the old year from the URL

        // Check if the year to update exists
        const yearExistsResult = await db.query(
          "SELECT seamster_id FROM seamster_detail WHERE uni_id = $1 AND year = $2",
          [uni_id, oldYear]
        );

        if (yearExistsResult.rows.length === 0) {
          return res.json({
            success: false,
            message: "Year not found for this university.",
          });
        }

        // Update the year in the database
        const row = yearExistsResult.rows;
        for (let index = 0; index < row.length; index++) {
          const element = row[index];
          await db.query(
            "DELETE FROM seamster_rounding WHERE seamster_id = $1",
            [element.seamster_id]
          );
        }
        await db.query(
          "DELETE FROM seamster_detail WHERE uni_id = $1 AND year = $2",
          [uni_id, oldYear]
        );

        return res.json({
          success: true,
          message: "Year deleted successfully.",
        });
      } else {
        return res.json({
          success: false,
          message: "Method not allowed.",
        });
      }
    } else {
      return res.json({
        success: false,
        message: "Unauthorized.",
      });
    }
  } catch (err) {
    console.error(err);
    return res.json({
      success: false,
      message: "Failed to manage register year.",
    });
  }
}
async function a_manageRegisterSemester(req, res) {
  try {
    const user = await getUserFromRequest(req);

    if (user != null) {
      const { uni_id, year } = req.params; // For edit, uni_id is required in the URL
      const { semester } = req.body; // Year to add or update

      if (req.method === "POST") {
        // Add new year
        // Check if the year already exists
        const existsResult = await db.query(
          "SELECT 1 FROM seamster_detail WHERE uni_id = $1 AND year = $2 AND seamster_round = $3",
          [uni_id, year, semester]
        );

        if (existsResult.rows.length > 0) {
          return res.json({
            success: false,
            message:
              "Semester in this year has already exists for this university.",
          });
        }

        // If year doesn't exist, proceed with adding it (you'll need to define the logic for this)

        await db.query(
          "INSERT INTO seamster_detail(year,uni_id,seamster_round) VALUES ($1,$2,$3);",
          [year, uni_id, semester]
        );

        return res.json({
          success: true,
          message: "Semester added successfully.",
        });
      } else if (req.method === "PUT") {
        // Edit existing year
        const { oldSemester } = req.params; // Get the old year from the URL

        // Check if the year to update exists
        const yearExistsResult = await db.query(
          "SELECT 1 FROM seamster_detail WHERE uni_id = $1 AND year = $2 AND seamster_round = $3",
          [uni_id, year, oldSemester]
        );

        if (yearExistsResult.rows.length === 0) {
          return res.json({
            success: false,
            message: "Semester not found for this university.",
          });
        }

        // Update the year in the database
        await db.query(
          "UPDATE seamster_detail SET seamster_round = $1 WHERE uni_id = $2 AND year = $3 AND seamster_round = $4",
          [semester, uni_id, year, oldSemester]
        );

        return res.json({
          success: true,
          message: "Semester updated successfully.",
        });
      } else if (req.method === "DELETE") {
        // Edit existing year
        const { semester } = req.params; // Get the old year from the URL

        // Check if the year to update exists
        const yearExistsResult = await db.query(
          "SELECT seamster_id FROM seamster_detail WHERE uni_id = $1 AND year = $2 AND seamster_round = $3",
          [uni_id, year, semester]
        );

        if (yearExistsResult.rows.length === 0) {
          return res.json({
            success: false,
            message: "Semester not found for this university.",
          });
        }

        // Update the year in the database
        await db.query("DELETE FROM seamster_rounding WHERE seamster_id = $1", [
          yearExistsResult.rows[0].seamster_id,
        ]);
        await db.query("DELETE FROM seamster_detail WHERE seamster_id = $1", [
          yearExistsResult.rows[0].seamster_id,
        ]);

        return res.json({
          success: true,
          message: "Semester deleted successfully.",
        });
      } else {
        return res.json({
          success: false,
          message: "Method not allowed.",
        });
      }
    } else {
      return res.json({
        success: false,
        message: "Unauthorized.",
      });
    }
  } catch (err) {
    console.error(err);
    return res.json({
      success: false,
      message: "Failed to manage register semester.",
    });
  }
}

async function a_manageRegisterTimeline(req, res) {
  try {
    const user = await getUserFromRequest(req);

    if (user != null) {
      const { uni_id, year, semester } = req.params;
      const { ss_round } = req.body;

      // Input Validation (You might want to add more validation)
      if (!year) {
        return res.status(400).json({ error: "Year are required." });
      }

      if (req.method === "POST") {
        // Check if the year already exists
        const existsResult = await db.query(
          "SELECT 1 FROM seamster_rounding WHERE ss_round = $1 AND seamster_id = (SELECT seamster_id FROM seamster_detail WHERE uni_id = $2 AND year = $3 AND seamster_round = $4)",
          [ss_round, uni_id, year, semester]
        );

        if (existsResult.rows.length > 0) {
          return res.json({
            success: false,
            message:
              "Timeline in this semester has already exists for this university.",
          });
        }

        // Add new semester data
        const insertResult = await db.query(
          `INSERT INTO seamster_rounding (seamster_id, ss_round, std_year, ss_start, ss_end)
           SELECT seamster_id, $2, $3, $4, $5
           FROM seamster_detail
           WHERE uni_id = $1 AND year = $6 AND seamster_round = $7
           RETURNING *;`,
          [uni_id, ss_round, null, null, null, year, semester]
        );

        if (insertResult.rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: "Semester not found for this university and year.",
          });
        }

        return res.status(201).json({
          success: true,
          message: "Semester data added successfully.",
          data: insertResult.rows[0],
        });
      } else if (req.method === "PUT") {
        // Edit existing semester data
        const { oldTimeline } = req.params; // Get the old semester round from the URL

        // Check if the year already exists
        const existsResult = await db.query(
          "SELECT 1 FROM seamster_rounding WHERE ss_round = $1 AND seamster_id = (SELECT seamster_id FROM seamster_detail WHERE uni_id = $2 AND year = $3 AND seamster_round = $4)",
          [ss_round, uni_id, year, semester]
        );

        if (existsResult.rows.length > 0) {
          return res.json({
            success: false,
            message:
              "Timeline in this semester has already exists for this university.",
          });
        }

        // Update the semester data in the database
        const updateResult = await db.query(
          `UPDATE seamster_rounding
           SET
             ss_round = $1
           WHERE
             seamster_id = (SELECT seamster_id FROM seamster_detail WHERE uni_id = $2 AND year = $3 AND seamster_round = $4)
             AND ss_round = $5
           RETURNING *;`,
          [ss_round, uni_id, year, semester, oldTimeline]
        );

        if (updateResult.rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: "Semester data not found.",
          });
        }

        return res.json({
          success: true,
          message: "Semester data updated successfully.",
          data: updateResult.rows[0],
        });
      } else if (req.method === "DELETE") {
        // Remove existing semester data
        const { timeline } = req.params; // Get the old semester round from the URL

        // Check if the year already exists
        const existsResult = await db.query(
          "SELECT 1 FROM seamster_rounding WHERE ss_round = $1 AND seamster_id = (SELECT seamster_id FROM seamster_detail WHERE uni_id = $2 AND year = $3 AND seamster_round = $4)",
          [timeline, uni_id, year, semester]
        );

        if (existsResult.rows.length == 0) {
          return res.json({
            success: false,
            message: "Not found Timeline in this semester.",
          });
        }

        // Delete the semester data from the database
        const deleteResult = await db.query(
          `DELETE FROM seamster_rounding
           WHERE
             seamster_id = (SELECT seamster_id FROM seamster_detail WHERE uni_id = $1 AND year = $2 AND seamster_round = $3)
             AND ss_round = $4
           RETURNING *;`,
          [uni_id, year, semester, timeline]
        );

        if (deleteResult.rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: "Semester data not found.",
          });
        }

        return res.json({
          success: true,
          message: "Semester data deleted successfully.",
          data: deleteResult.rows[0], // Optionally return the deleted data
        });
      } else {
        return res.status(405).json({
          success: CSSFontFeatureValuesRule,
          message: "Method not allowed.",
        });
      }
    } else {
      return res.status(401).json({
        success: false,
        message: "Unauthorized.",
      });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to manage register semester data.",
    });
  }
}

async function a_manageRegisterSubTimeline(req, res) {
  try {
    const user = await getUserFromRequest(req);

    if (user != null) {
      const { uni_id, year, semester } = req.params;
      const { ss_round, std_year, ss_start, ss_end } = req.body;

      // Input Validation (You might want to add more validation)
      if (!year) {
        return res.status(400).json({ error: "Year are required." });
      }

      if (req.method === "POST") {
        // Check if the year already exists
        const existsResult = await db.query(
          "SELECT 1 FROM seamster_rounding WHERE ss_round = $1 AND seamster_id = (SELECT seamster_id FROM seamster_detail WHERE uni_id = $2 AND year = $3 AND seamster_round = $4) AND std_year = $5",
          [ss_round, uni_id, year, semester, std_year]
        );

        if (existsResult.rows.length > 0) {
          return res.json({
            success: false,
            message:
              "Sub-Timeline in this semester has already exists for this university.",
          });
        }

        // Add new semester data
        const insertResult = await db.query(
          `INSERT INTO seamster_rounding (seamster_id, ss_round, std_year, ss_start, ss_end)
           SELECT seamster_id, $2, $3, $4, $5
           FROM seamster_detail
           WHERE uni_id = $1 AND year = $6 AND seamster_round = $7
           RETURNING *;`,
          [uni_id, ss_round, std_year, ss_start, ss_end, year, semester]
        );

        if (insertResult.rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: "Semester not found for this university and year.",
          });
        }

        return res.status(201).json({
          success: true,
          message: "Semester data added successfully.",
          data: insertResult.rows[0],
        });
      } else if (req.method === "PUT") {
        // Edit existing semester data
        const { oldSub, timeline } = req.params; // Get the old semester round from the URL

        // Check if the year already exists
        const existsResult = await db.query(
          "SELECT 1 FROM seamster_rounding WHERE ss_round = $1 AND seamster_id = (SELECT seamster_id FROM seamster_detail WHERE uni_id = $2 AND year = $3 AND seamster_round = $4) AND std_year = $5",
          [timeline, uni_id, year, semester, oldSub]
        );

        if (existsResult.rows.length == 0) {
          return res.json({
            success: false,
            message: "Sub-Timeline not found in this semester.",
          });
        }

        // Update the semester data in the database
        const updateResult = await db.query(
          `UPDATE seamster_rounding
           SET
             ss_round = $1,
             std_year = $2,
             ss_start = $3,
             ss_end = $4
           WHERE
             seamster_id = (SELECT seamster_id FROM seamster_detail WHERE uni_id = $5 AND year = $6 AND seamster_round = $7)
             AND ss_round = $8
             AND std_year = $9
           RETURNING *;`,
          [
            ss_round,
            std_year,
            ss_start,
            ss_end,
            uni_id,
            year,
            semester,
            timeline,
            oldSub,
          ]
        );

        if (updateResult.rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: "Semester data not found.",
          });
        }

        return res.json({
          success: true,
          message: "Semester data updated successfully.",
          data: updateResult.rows[0],
        });
      } else if (req.method === "DELETE") {
        // Remove existing semester data
        const { timeline, sub } = req.params; // Get the old semester round from the URL

        // Check if the year already exists
        const existsResult = await db.query(
          "SELECT 1 FROM seamster_rounding WHERE ss_round = $1 AND seamster_id = (SELECT seamster_id FROM seamster_detail WHERE uni_id = $2 AND year = $3 AND seamster_round = $4) AND std_year = $5",
          [timeline, uni_id, year, semester, sub]
        );

        if (existsResult.rows.length == 0) {
          return res.json({
            success: false,
            message: "Sub-Timeline not found in this semester.",
          });
        }

        // Delete the semester data from the database
        const deleteResult = await db.query(
          `DELETE FROM seamster_rounding
           WHERE
             seamster_id = (SELECT seamster_id FROM seamster_detail WHERE uni_id = $1 AND year = $2 AND seamster_round = $3)
             AND ss_round = $4 AND std_year = $5
           RETURNING *;`,
          [uni_id, year, semester, timeline, sub]
        );

        if (deleteResult.rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: "Semester data not found.",
          });
        }

        return res.json({
          success: true,
          message: "Semester data deleted successfully.",
          data: deleteResult.rows[0], // Optionally return the deleted data
        });
      } else {
        return res.status(405).json({
          success: false,
          message: "Method not allowed.",
        });
      }
    } else {
      return res.status(401).json({
        success: false,
        message: "Unauthorized.",
      });
    }
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Failed to manage register semester data." });
  }
}

module.exports = {
  getRegisterIntevals,
  a_manageRegisterYear,
  a_manageRegisterSemester,
  a_manageRegisterTimeline,
  a_manageRegisterSubTimeline,
};
