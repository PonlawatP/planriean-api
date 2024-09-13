const db = require("../../db");
const { getUserFromToken } = require("../../utils/userutil");

async function getRegisterIntevals(req, res) {
  try {
    const user = await getUserFromToken(req);
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

      console.log(result.rows);

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
    const user = await getUserFromToken(req);

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

module.exports = {
  getRegisterIntevals,
  a_manageRegisterYear,
};
