import { test, expect, mock, beforeEach } from 'bun:test';
process.env.SECRET_JWT = 'test-secret-placeholder';
globalThis.__db ??= { handler: async () => ({ rows: [], rowCount: 0 }), calls: [] };
mock.module('../../src/db', () => ({ query: async (t, p) => { __db.calls.push([t, p]); return __db.handler(t, p); } }));
const jwt = require('jwt-simple');
const mkRes = () => { const r = { code: 200, body: undefined, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, send(b) { r.body = b; return r; } }; return r; };
const tok = (c) => jwt.encode(c, process.env.SECRET_JWT);
beforeEach(() => { __db.calls = []; __db.handler = async () => ({ rows: [], rowCount: 0 }); });

const U = require('../../src/routes/university');
// plain end-user (no addition roles) token
const plainUser = () => { __db.handler = async (sql, p) => {
  if (/FROM user_detail WHERE uid/.test(sql)) return { rows: [{ uid: 1, uni_id: null }], rowCount: 1 };
  if (/plan_detail/.test(sql)) return { rows: [{ count: 0 }], rowCount: 1 };
  if (/SELECT uni_id FROM university_detail ORDER BY/.test(sql)) return { rows: [{ uni_id: 4 }], rowCount: 1 };
  return { rows: [], rowCount: 1 }; }; };
const rq = (body, params = {}) => ({ headers: { authorization: tok({ uid: 1 }) }, body, params });

test('addUniversityDetail assigns uni_id = MAX(uni_id)+1 (non-atomic) and returns 201', async () => {
  plainUser();
  const res = mkRes();
  await U.addUniversityDetail(rq({ uni_key: 'KKU', uni_name_th: 'ขอนแก่น', uni_name_en: 'Khon Kaen', uni_logo: 'u' }), res);
  expect(res.code).toBe(201);
  expect(__db.calls.find((c) => c[0].includes('INSERT INTO university_detail'))[1]).toEqual(['KKU', 'ขอนแก่น', 'Khon Kaen', 'u', 5]);
});
test('addUniversityDetail on empty table starts at uni_id 1', async () => {
  __db.handler = async (sql) => /FROM user_detail/.test(sql) ? { rows: [{ uid: 1 }], rowCount: 1 } : /ORDER BY uni_id DESC/.test(sql) ? { rows: [], rowCount: 0 } : { rows: [], rowCount: 1 };
  await U.addUniversityDetail(rq({ uni_key: 'A' }), mkRes());
  expect(__db.calls.find((c) => c[0].includes('INSERT INTO university_detail'))[1].at(-1)).toBe(1);
});
test('db error on create -> 500 generic message', async () => {
  __db.handler = async () => { throw new Error('dup'); };
  const res = mkRes(); await U.addUniversityDetail(rq({}), res);
  expect(res.code).toBe(500);
});
test('removeUniversityDetail 404 when no row, 200 when deleted', async () => {
  __db.handler = async (sql) => /DELETE/.test(sql) ? { rows: [], rowCount: 0 } : { rows: [], rowCount: 0 };
  let res = mkRes(); await U.removeUniversityDetail(rq({}, { uni_id: 9 }), res);
  expect(res.code).toBe(404);
  __db.handler = async () => ({ rows: [], rowCount: 1 });
  res = mkRes(); await U.removeUniversityDetail(rq({}, { uni_id: 9 }), res);
  expect(res.code).toBe(200);
});
test('editUniversityDetail overwrites all 5 columns (omitted fields become NULL)', async () => {
  plainUser();
  await U.editUniversityDetail(rq({ uni_name_en: 'Only' }, { uni_id: 1 }), mkRes());
  expect(__db.calls.find((c) => c[0].includes('UPDATE university_detail'))[1]).toEqual([undefined, undefined, 'Only', undefined, undefined, 1]);
});
test('faculty add/edit/remove status codes', async () => {
  plainUser();
  let res = mkRes(); await U.addFacultyDetail(rq({ fac_id: 1, fac_key: 'SCI' }, { uni_id: 1 }), res); expect(res.code).toBe(201);
  __db.handler = async () => ({ rows: [], rowCount: 0 });
  res = mkRes(); await U.editFacultyDetail(rq({}, { uni_id: 1, fac_id: 2 }), res); expect(res.code).toBe(404);
  res = mkRes(); await U.removeFacultyDetail(rq({}, { uni_id: 1, fac_id: 2 }), res); expect(res.code).toBe(404);
});

// A-UNI-2 / H3: role guards live in middleware/requireRole.js (wired in src/index.js); covered in authz-guards.test.js

// getUniversityDetailFunc / list / season
const uniWorld = (seasons) => { __db.handler = async (sql) => {
  if (/FROM university_detail WHERE uni_id/.test(sql)) return { rows: [{ uni_id: 1, uni_key: 'MSU' }], rowCount: 1 };
  if (/FROM university_faculty/.test(sql)) return { rows: [{ fac_id: 1, uni_id: 1 }], rowCount: 1 };
  if (/FROM courseset_group/.test(sql)) return { rows: [{ cr_group_id: 1 }], rowCount: 1 };
  if (/seamster_detail/.test(sql) && /LEFT JOIN/.test(sql)) return { rows: seasons, rowCount: seasons.length };
  if (/count\(\*\) FROM courseset_detail/.test(sql)) return { rows: [{ count: '0' }], rowCount: 1 };
  return { rows: [], rowCount: 0 }; }; };
const future = (d) => new Date(Date.now() + d * 864e5).toISOString();

test('getUniversityDetailFunc: unknown uni -> null', async () => {
  expect(await U.getUniversityDetailFunc(99, 'normal')).toBeNull();
});
test('getUniversityDetailFunc normal: returns {university_data{seasons}, facultys (uni_id removed), coursesets}', async () => {
  uniWorld([{ year: 1, seamster_round: 1, ss_start: future(-10), ss_end: future(-5) }, { year: 1, seamster_round: 2, ss_start: future(5), ss_end: future(9) }]);
  const r = await U.getUniversityDetailFunc(1, 'normal');
  expect(r.university_data.seasons.current).toEqual({ year: 1, semester: 1 });
  expect(r.university_data.seasons.incomming).toEqual({ year: 1, semester: 2 });
  expect(r.facultys[0].uni_id).toBeUndefined();
  expect(r.coursesets).toEqual([{ cr_group_id: 1 }]);
});
test('type=major_group builds faculty.coursesets[].children grouped by cr_key (case-insensitive, uppercased)', async () => {
  uniWorld([]);
  const base = __db.handler;
  __db.handler = async (sql, p) => /FROM courseset_detail WHERE uni_id/.test(sql) ? { rows: [
    { cr_key: 'cs', name_th: 'a', name_en: 'a', cr_id: 1, courseset_id: 1, cr_group_id: 1 },
    { cr_key: 'CS', name_th: 'a', name_en: 'a', cr_id: 2, courseset_id: 2, cr_group_id: 1 }], rowCount: 2 } : base(sql, p);
  const r = await U.getUniversityDetailFunc(1, 'major_group');
  const ch = r.facultys[0].coursesets[0].children;
  expect(ch).toHaveLength(1);
  expect(ch[0].cr_key).toBe('CS');
  expect(ch[0].children.map((c) => c.cr_id)).toEqual([1, 2]);
});
// BUG A-UNI-3: maintenance flag uses rowCount of "SELECT count(*)" which is ALWAYS 1 -> maintenance is always false.
test.failing('BUG A-UNI-3: type=maintenance should be true when the university has no coursesets', async () => {
  uniWorld([]);
  expect((await U.getUniversityDetailFunc(1, 'maintenance')).maintenance).toBe(true);
});
// BUG A-UNI-1 end-to-end: before the first season ends the whole university detail throws -> route answers 404.
test('H10 fixed: GET /university/:id before the first season ends answers data (current null, incomming = first season)', async () => {
  uniWorld([{ year: 1, seamster_round: 1, ss_start: future(1), ss_end: future(5) }]);
  const res = mkRes(); await U.getUniversityDetail({ params: { uni_id: 1 }, query: {} }, res);
  expect(res.code).not.toBe(404);
  const seasons = res.body.university_data.seasons;
  expect(seasons.current).toBeNull();
  expect(seasons.incomming).toEqual({ year: 1, semester: 1 });
});
test('getUniversitySeasons: 404 for unknown university; groups years desc', async () => {
  let res = mkRes(); await U.getUniversitySeasons({ params: { uni_id: 9 } }, res);
  expect(res.code).toBe(404);
  __db.handler = async (sql, p) => {
    if (/FROM university_detail/.test(sql)) return { rows: [{ uni_id: 1 }], rowCount: 1 };
    if (/FROM seamster_detail/.test(sql)) return { rows: [{ seamster_id: 1, year: 2568, seamster_round: 1, uni_id: 1 }, { seamster_id: 2, year: 2569, seamster_round: 1, uni_id: 1 }], rowCount: 2 };
    if (/FROM seamster_rounding/.test(sql)) return { rows: [{ ss_round: 1, seamster_id: p[0], ss_start: null, ss_end: null, std_year: 1 }], rowCount: 1 };
    return { rows: [], rowCount: 0 }; };
  res = mkRes(); await U.getUniversitySeasons({ params: { uni_id: 1 } }, res);
  expect(res.body.years.map((y) => y.year)).toEqual([2569, 2568]);
});
test('getUniversityList wraps rows in {data} and 404s on db error', async () => {
  __db.handler = async () => ({ rows: [{ uni_id: 1 }], rowCount: 1 });
  let res = mkRes(); await U.getUniversityList({}, res);
  expect(res.body).toEqual({ data: [{ uni_id: 1 }] });
  __db.handler = async () => { throw new Error('x'); };
  res = mkRes(); await U.getUniversityList({}, res);
  expect(res.code).toBe(404);
});
