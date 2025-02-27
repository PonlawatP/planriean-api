// Function to group data
function semesterRoundGroupData(data) {
  const grouped = {};

  data.forEach((item) => {
    const key = `${item.ss_round}-${item.seamster_id}`;

    if (!grouped[key]) {
      grouped[key] = {
        ss_round: item.ss_round,
        child: [],
      };
    }

    grouped[key].child.push({
      ss_start: item.ss_start,
      ss_end: item.ss_end,
      std_year: item.std_year,
    });
  });

  return Object.values(grouped);
}
function semesterYearGroupData(data) {
  const grouped = {};

  data.forEach((item) => {
    const key = `${item.year}`;

    if (!grouped[key]) {
      grouped[key] = {
        year: item.year,
        semesters: [],
      };
    }

    grouped[key].semesters.push({
      semester: item.seamster_round,
      seamster_rounding: item.seamster_rounding,
    });
  });

  data.forEach((item) => {
    const key = `${item.year}`;

    grouped[key].semesters = grouped[key].semesters.sort(
      (a, b) => a.semester - b.semester
    );
  });

  return Object.values(grouped).sort((a, b) => b.year - a.year);
}
function getCurrentSeason(seasons, currentDate, incomming = false) {
  let currentDateTime = new Date(currentDate);

  for (let i = 0; i < seasons.length; i++) {
    const season = seasons[i];
    const start = new Date(season.ss_start);
    const end = new Date(season.ss_end);

    // console.log(season, currentDateTime <= end);
    if (currentDateTime <= end) {
      const current = seasons[incomming ? i : i - 1];
      return {
        year: current.year,
        semester: current.seamster_round,
      };
    }
  }

  return null; // Return null if no matching season is found
}

function getSeasonRemaining(seasons, currentDate) {
  let currentDateTime = new Date(currentDate);

  const res = []
  let is_found = false;
  for (let i = 0; i < seasons.length; i++) {
    const season = seasons[i];
    // const start = new Date(season.ss_start);
    const end = new Date(season.ss_end);

    // console.log(season, currentDateTime <= end);
    if (currentDateTime <= end) {
      if (!is_found) {
        is_found = true;
        res.push({ ...seasons[i - 1], seamster_round: undefined, semester: seasons[i - 1].seamster_round })
      }
      res.push({ ...seasons[i], seamster_round: undefined, semester: seasons[i].seamster_round })
    }
  }

  return res;
}

module.exports = { semesterRoundGroupData, semesterYearGroupData, getCurrentSeason, getSeasonRemaining };
