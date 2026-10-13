import { test, expect } from 'bun:test';
const { semesterRoundGroupData, semesterYearGroupData, getCurrentSeason, getSeasonRemaining } = require('../../src/utils/seasonutil');

test('semesterRoundGroupData groups rows by ss_round+seamster_id', () => {
  const out = semesterRoundGroupData([
    { ss_round: 1, seamster_id: 7, ss_start: 'a', ss_end: 'b', std_year: 1 },
    { ss_round: 1, seamster_id: 7, ss_start: 'c', ss_end: 'd', std_year: 2 },
    { ss_round: 2, seamster_id: 7, ss_start: 'e', ss_end: 'f', std_year: 1 },
  ]);
  expect(out).toHaveLength(2);
  expect(out[0]).toEqual({ ss_round: 1, child: [{ ss_start: 'a', ss_end: 'b', std_year: 1 }, { ss_start: 'c', ss_end: 'd', std_year: 2 }] });
});

test('semesterYearGroupData sorts years desc and semesters asc', () => {
  const out = semesterYearGroupData([
    { year: 2568, seamster_round: 2, seamster_rounding: [] },
    { year: 2569, seamster_round: 1, seamster_rounding: [] },
    { year: 2568, seamster_round: 1, seamster_rounding: [] },
  ]);
  expect(out.map((y) => y.year)).toEqual([2569, 2568]);
  expect(out[1].semesters.map((s) => s.semester)).toEqual([1, 2]);
});

const seasons = [
  { year: 2568, seamster_round: 2, ss_start: '2026-01-01T00:00:00Z', ss_end: '2026-01-10T00:00:00Z' },
  { year: 2569, seamster_round: 1, ss_start: '2026-06-01T00:00:00Z', ss_end: '2026-06-10T00:00:00Z' },
  { year: 2569, seamster_round: 2, ss_start: '2026-11-01T00:00:00Z', ss_end: '2026-11-10T00:00:00Z' },
];

test('getCurrentSeason: "current" = the row BEFORE the first row whose ss_end >= now; "incomming" = that row', () => {
  const now = '2026-07-01T00:00:00Z';
  expect(getCurrentSeason(seasons, now)).toEqual({ year: 2569, semester: 1 });
  expect(getCurrentSeason(seasons, now, true)).toEqual({ year: 2569, semester: 2 });
});

test('getCurrentSeason returns null after every season ended', () => {
  expect(getCurrentSeason(seasons, '2027-01-01T00:00:00Z')).toBeNull();
});

test('getSeasonRemaining includes the previous (already ended) row first, renames seamster_round->semester', () => {
  const out = getSeasonRemaining(seasons, '2026-07-01T00:00:00Z');
  expect(out).toHaveLength(2);
  expect(out[0]).toMatchObject({ year: 2569, semester: 1, seamster_round: undefined });
  expect(out[1]).toMatchObject({ year: 2569, semester: 2 });
});

// BUG A-UNI-1: when today is before the FIRST season's end, seasons[i-1] is undefined -> TypeError.
// It bubbles up to GET /university/:id (404 "University Not Found") and GET /university/:id/... callers.
test.skip('BUG A-UNI-1: getCurrentSeason should not throw before the first season', () => {
  expect(() => getCurrentSeason(seasons, '2025-01-01T00:00:00Z')).not.toThrow();
});
test('BUG A-UNI-1 (documented current behaviour): getCurrentSeason throws before first season', () => {
  expect(() => getCurrentSeason(seasons, '2025-01-01T00:00:00Z')).toThrow();
  expect(() => getSeasonRemaining(seasons, '2025-01-01T00:00:00Z')).toThrow();
});

test('null ss_end (LEFT JOIN without rounding) is skipped as epoch', () => {
  const s = [{ year: 2569, seamster_round: 1, ss_start: null, ss_end: null }, ...seasons.slice(1)];
  expect(getCurrentSeason(s, '2026-07-01T00:00:00Z')).toEqual({ year: 2569, semester: 1 });
});
