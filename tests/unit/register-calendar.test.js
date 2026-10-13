// Unit tests for src/routes/register/index.js — registration calendar (seamster_detail / seamster_rounding)
// that the frontend reads and scrap-service uses to pick its scraping cadence.
// Book: .feature-books/features/feat-registration-calendar.md
import { test, expect, mock, beforeEach } from 'bun:test';
process.env.SECRET_JWT = 'test-secret-placeholder';
globalThis.__db ??= { handler: async () => ({ rows: [], rowCount: 0 }), calls: [] };
mock.module('../../src/db', () => ({ query: async (t, p) => { __db.calls.push([t, p]); return __db.handler(t, p); } }));
const jwt = require('jwt-simple');
const RG = require('../../src/routes/register');

const rs = (rows) => ({ rows, rowCount: rows.length });
function useDb(rules = []) {
  __db.handler = async (sql, p) => {
    if (/FROM user_detail WHERE uid/.test(sql)) return rs(p[0] === 7 ? [{ uid: 7, uni_id: 1 }] : []);
    if (/COUNT\(\*\) AS INT/.test(sql)) return rs([{ count: 0 }]);
    if (/user_additionrole/.test(sql)) return rs([]);
    for (const [re, v] of rules) if (re.test(sql)) return rs(typeof v === 'function' ? v(sql, p) : v);
    return rs([]);
  };
}
const mkRes = () => { const r = { code: 200, body: undefined, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, send(b) { r.body = b; return r; } }; return r; };
const rq = (method, params = {}, body = {}, uid = 7) => ({ method, headers: uid == null ? {} : { authorization: jwt.encode({ uid }, process.env.SECRET_JWT) }, params: { uni_id: 1, ...params }, body });
const sqlCalls = (re) => __db.calls.filter((c) => re.test(c[0]));
beforeEach(() => { __db.calls = []; useDb(); });

const r = (year, seamster_round, seamster_id, ss_round, std_year, ss_start = null, ss_end = null) => ({ year, seamster_round, seamster_id, ss_round, std_year, ss_start, ss_end });
test('GET intervals: years DESC, semesters ASC by round, timelines ASC by ss_round, std_years DESC; null std_year rows are timeline headers only', async () => {
  useDb([[/FROM\s+seamster_detail/, [
    r(2568, 1, 1, 1, 1, 'a', 'b'),
    r(2569, 2, 3, null, null),
    r(2569, 1, 2, 2, null),
    r(2569, 1, 2, 2, 1, 's1', 'e1'),
    r(2569, 1, 2, 2, 4, 's4', 'e4'),
    r(2569, 1, 2, 1, 2, 's', 'e'),
  ]]]);
  const res = mkRes(); await RG.getRegisterIntevals(rq('GET'), res);
  const d = res.body.data;
  expect(d.map((y) => y.year)).toEqual([2569, 2568]);
  expect(d[0].semesters.map((s) => s.round)).toEqual([1, 2]);
  expect(d[0].semesters[1].timelines).toEqual([]);
  expect(d[0].semesters[0].timelines.map((t) => t.sub_round)).toEqual([1, 2]);
  expect(d[0].semesters[0].timelines[1].std_years).toEqual([{ std_year: 4, sub_start: 's4', sub_end: 'e4' }, { std_year: 1, sub_start: 's1', sub_end: 'e1' }]);
});
test('GET intervals: anonymous -> 404 with the copy-pasted message "Courseset Restriction Not Found"', async () => {
  const res = mkRes(); await RG.getRegisterIntevals(rq('GET', {}, {}, null), res);
  expect(res.code).toBe(404);
  expect(res.body).toBe('Courseset Restriction Not Found');
});
test.todo('BUG-REG-1: a rounding row with std_year but NULL ss_round must not make the whole calendar 404', async () => {
  useDb([[/FROM\s+seamster_detail/, [r(2569, 1, 2, null, 1, 's', 'e')]]]);
  const res = mkRes(); await RG.getRegisterIntevals(rq('GET'), res);
  expect(res.code).toBe(200);
});
test('POST year inserts the year together with semester round 1; duplicate year -> 200 {success:false}', async () => {
  let res = mkRes(); await RG.a_manageRegisterYear(rq('POST', {}, { year: 2570 }), res);
  expect(res.body.success).toBe(true);
  expect(sqlCalls(/INSERT INTO seamster_detail/)[0][1]).toEqual([2570, 1, 1]);
  useDb([[/SELECT 1 FROM seamster_detail/, [{}]]]);
  res = mkRes(); await RG.a_manageRegisterYear(rq('POST', {}, { year: 2570 }), res);
  expect(res.code).toBe(200);
  expect(res.body).toEqual({ success: false, message: 'Year already exists for this university.' });
});
test('DELETE year removes every seamster_rounding of each semester first, then the seamster_detail rows', async () => {
  useDb([[/SELECT seamster_id FROM seamster_detail/, [{ seamster_id: 2 }, { seamster_id: 3 }]]]);
  await RG.a_manageRegisterYear(rq('DELETE', { oldYear: 2569 }), mkRes());
  expect(sqlCalls(/DELETE FROM seamster_rounding/).map((c) => c[1])).toEqual([[2], [3]]);
  expect(sqlCalls(/DELETE FROM seamster_detail/)[0][1]).toEqual([1, 2569]);
});
test('year/semester management never returns an error status: unauthenticated -> 200 {success:false,"Unauthorized."}', async () => {
  const res = mkRes(); await RG.a_manageRegisterSemester(rq('POST', { year: 2569 }, { semester: 3 }, null), res);
  expect(res.code).toBe(200);
  expect(res.body).toEqual({ success: false, message: 'Unauthorized.' });
});
test('POST timeline creates a header row (std_year/ss_start/ss_end NULL) under the (uni, year, semester) seamster_id', async () => {
  useDb([[/INSERT INTO seamster_rounding/, [{ ss_round: 3 }]]]);
  const res = mkRes(); await RG.a_manageRegisterTimeline(rq('POST', { year: 2569, semester: 1 }, { ss_round: 3 }), res);
  expect(res.code).toBe(201);
  expect(sqlCalls(/INSERT INTO seamster_rounding/)[0][1]).toEqual([1, 3, null, null, null, 2569, 1]);
});
test('POST timeline for a semester that does not exist -> 404', async () => {
  const res = mkRes(); await RG.a_manageRegisterTimeline(rq('POST', { year: 2569, semester: 9 }, { ss_round: 1 }), res);
  expect(res.code).toBe(404);
});
test('POST sub-timeline = one std_year window (ss_start..ss_end) inside a timeline; duplicate (ss_round, std_year) rejected', async () => {
  useDb([[/INSERT INTO seamster_rounding/, [{}]]]);
  const body = { ss_round: 1, std_year: 2, ss_start: '2026-06-01', ss_end: '2026-06-02' };
  let res = mkRes(); await RG.a_manageRegisterSubTimeline(rq('POST', { year: 2569, semester: 1, timeline: 1 }, body), res);
  expect(res.code).toBe(201);
  expect(sqlCalls(/INSERT INTO seamster_rounding/)[0][1]).toEqual([1, 1, 2, '2026-06-01', '2026-06-02', 2569, 1]);
  useDb([[/SELECT 1 FROM seamster_rounding/, [{}]]]);
  res = mkRes(); await RG.a_manageRegisterSubTimeline(rq('POST', { year: 2569, semester: 1, timeline: 1 }, body), res);
  expect(res.body.success).toBe(false);
});
test('BUG-ROLE (current behavior): calendar writes only require "logged in" — plain user can add a year', async () => {
  const res = mkRes(); await RG.a_manageRegisterYear(rq('POST', {}, { year: 2571 }), res);
  expect(res.body.success).toBe(true);
});
