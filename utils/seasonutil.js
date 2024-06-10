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

module.exports = { semesterRoundGroupData, semesterYearGroupData };
