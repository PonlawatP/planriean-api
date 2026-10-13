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
// Rows without ss_end (LEFT JOIN with no rounding) have no usable date: ignore them.
const dated = (seasons) => seasons.filter((s) => s.ss_end != null);
const pick = (s) => (s ? { year: s.year, semester: s.seamster_round } : null);

// current   = the last season that has already ended (null before the first one)
// incomming = the first season whose ss_end is still ahead (null once all have ended)
function getCurrentSeason(seasons, currentDate, incomming = false) {
  const rows = dated(seasons);
  const now = new Date(currentDate);
  const i = rows.findIndex((s) => now <= new Date(s.ss_end));

  if (incomming) return i === -1 ? null : pick(rows[i]);
  if (i === -1) return pick(rows[rows.length - 1]); // all ended -> latest one is current
  return i === 0 ? null : pick(rows[i - 1]);
}

function getSeasonRemaining(seasons, currentDate) {
  const rows = dated(seasons);
  const now = new Date(currentDate);
  const i = rows.findIndex((s) => now <= new Date(s.ss_end));
  if (i === -1) return [];

  // include the previous (already ended) row first when there is one
  const ahead = rows.filter((s) => now <= new Date(s.ss_end));
  return (i === 0 ? ahead : [rows[i - 1], ...ahead]).map((s) => ({ ...s, seamster_round: undefined, semester: s.seamster_round }));
}

module.exports = { semesterRoundGroupData, semesterYearGroupData, getCurrentSeason, getSeasonRemaining };
