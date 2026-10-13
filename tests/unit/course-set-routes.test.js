// Unit tests for src/routes/course-set/index.js and src/routes/course-set-group/index.js (curriculum data).
// Mocked db/redis only. Books: .feature-books/features/feat-course-set.md, feat-course-set-group.md
import { test, expect, mock, beforeEach } from 'bun:test';
process.env.SECRET_JWT = 'test-secret-placeholder';
globalThis.__db ??= { handler: async () => ({ rows: [], rowCount: 0 }), calls: [] };
mock.module('../../src/db', () => ({ query: async (t, p) => { __db.calls.push([t, p]); return __db.handler(t, p); } }));
globalThis.__redis ??= { store: new Map(), ops: [] };
class FakeRedis {
  async get(k) { __redis.ops.push(['get', k]); return __redis.store.get(k) ?? null; }
  async mget(...ks) { return ks.map((k) => __redis.store.get(k) ?? null); }
  async set(k, v, ...a) { __redis.ops.push(['set', k, v, ...a]); __redis.store.set(k, v); return 'OK'; }
  async del(k) { __redis.store.delete(k); }
  pipeline() { const q = []; const p = { set: (...a) => { q.push(a); return p; }, exec: async () => { for (const a of q) await this.set(...a); return []; } }; return p; }
  on() { return this; }
}
// register once per process: re-registering an already-mocked CJS module breaks the default-export interop
if (!globalThis.__ioredisMocked) { globalThis.__ioredisMocked = true; mock.module('ioredis', () => ({ __esModule: true, default: FakeRedis, Redis: FakeRedis })); }
const jwt = require('jwt-simple');
const CS = require('../../src/routes/course-set');
const CSG = require('../../src/routes/course-set-group');

const rs = (rows) => ({ rows, rowCount: rows.length });
function useDb(rules = [], users = { 7: { uid: 7, uni_id: 1, std_id: '640001' } }) {
  __db.handler = async (sql, p) => {
    if (/FROM user_detail WHERE uid/.test(sql)) return rs(users[p[0]] ? [users[p[0]]] : []);
    if (/COUNT\(\*\)/.test(sql)) return rs([{ count: 0 }]);
    if (/user_additionrole/.test(sql)) return rs([]);
    for (const [re, v] of rules) if (re.test(sql)) return rs(typeof v === 'function' ? v(sql, p) : v);
    return rs([]);
  };
}
const mkRes = () => { const r = { code: 200, body: undefined, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, send(b) { r.body = b; return r; } }; return r; };
const rq = (uid, params = {}, body = {}, query = {}) => ({ headers: uid == null ? {} : { authorization: jwt.encode({ uid }, process.env.SECRET_JWT) }, params, body, query });
const sqlCalls = (re) => __db.calls.filter((c) => re.test(c[0]));
beforeEach(() => { __db.calls = []; __redis.store = new Map(); __redis.ops = []; useDb(); });

// ---------- GET /university/:uni_id/course-set/:cr_id/map (index.js:161) ----------
const mapRules = (plan) => [
  [/FROM courseset_detail WHERE cr_id/, [{ cr_id: 5, uni_id: 1 }]],
  [/FROM courseset_subjectplan/, plan],
  [/FROM courseset_subject WHERE cr_id/, [{ suj_id: '0041001', suj_name_th: 'อังกฤษ' }]],
  [/FROM courseset_header WHERE cr_id/, [{ cr_head_id: '2.1', cr_name_th: 'วิชาเลือกเสรี' }]],
];
test('study map groups by std_year -> term -> index; "h-<cr_head_id>" rows become header placeholders; credit parsed to int', async () => {
  useDb(mapRules([
    { std_year: 1, term: 1, suj_id: '0041001', credit: '3(3-0-6)' },
    { std_year: 1, term: 1, suj_id: 'h-2.1', credit: '6' },
    { std_year: 2, term: 2, suj_id: '0041001', credit: '3' },
  ]));
  const res = mkRes(); await CS.getCoursesetMapping(rq(7, { uni_id: 1, cr_id: 5 }), res);
  const y1 = res.body.years[1].semesters[1].subjects;
  expect(y1[0]).toMatchObject({ suj_id: '0041001', suj_name_th: 'อังกฤษ', credit: 3 });
  expect(y1[1]).toMatchObject({ cr_head_id: '2.1', cr_name_th: 'วิชาเลือกเสรี', credit: 6 });
  expect(res.body.years[2].semesters[2].subjects[0].credit).toBe(3);
});
test('study map requires a logged-in user even though the route has no requireJWTAuth -> anonymous gets 404 "Courseset Not Found"', async () => {
  useDb(mapRules([]));
  const res = mkRes(); await CS.getCoursesetMapping(rq(null, { cr_id: 5 }), res);
  expect(res.code).toBe(404);
});
test.todo('BUG-CS-2: one subjectplan row with NULL/non-numeric credit must not 404 the whole study map', async () => {
  useDb(mapRules([{ std_year: 1, term: 1, suj_id: '0041001', credit: null }, { std_year: 1, term: 1, suj_id: '0041001', credit: '3' }]));
  const res = mkRes(); await CS.getCoursesetMapping(rq(7, { cr_id: 5 }), res);
  expect(res.code).toBe(200);
});

// ---------- PUT /university/:uni_id/course-set/:cr_id/map (index.js:264) ----------
test('BUG-CS-1 (current behavior): PUT map has NO auth — an anonymous request deletes and rewrites the study plan', async () => {
  useDb([[/INSERT INTO courseset_subjectplan/, [{}]]]);
  const body = [[{ semester: '1', subjects: [{ suj_id: '0041001', suj_credit: '3' }, { cr_head_id: '2.1', credit: '6' }] }]];
  const res = mkRes(); await CS.a_editCoursesetMapping(rq(null, { uni_id: 1, cr_id: 5 }, body), res);
  expect(res.code).toBe(200);
  expect(sqlCalls(/DELETE FROM courseset_subjectplan/)[0][1]).toEqual([5]);
  const ins = sqlCalls(/INSERT INTO courseset_subjectplan/).map((c) => c[1]);
  // array index -> std_year (+1), semester string -> int, header -> "h-<id>"
  expect(ins).toEqual([[5, 1, 1, '0041001', '3'], [5, 1, 1, 'h-2.1', '6']]);
});
// BUG-CS-1 / H3: anonymous + student PUT map is rejected by requireJWTAuth + requireRole('helper') -> authz-guards.test.js

// ---------- GET /university/:uni_id/course-set/:cr_id (index.js:160) — header tree ----------
test('curriculum tree: headers nest by cr_head_id_ref, sort numerically by dotted id (1.2 before 1.10), subjects attach by cr_head_id', async () => {
  useDb([
    [/FROM courseset_detail WHERE cr_id/, [{ cr_id: 5, uni_id: 1, fac_id: 12, cr_group_id: 3, major_key_ref: null }]],
    [/FROM courseset_header WHERE uni_id/, [
      { cr_head_id: '1', cr_head_id_ref: null }, { cr_head_id: '1.10', cr_head_id_ref: '1' }, { cr_head_id: '1.2', cr_head_id_ref: '1' }, { cr_head_id: '2', cr_head_id_ref: null },
    ]],
    [/FROM courseset_subject WHERE uni_id/, [{ suj_id: 'A', cr_head_id: '1.2' }]],
    [/FROM courseset_group/, [{ name_th: 'ป.ตรี' }]],
  ]);
  const res = mkRes(); await CS.getCoursesetDetail(rq(7, { cr_id: 5 }), res);
  expect(res.code).toBe(200);
  const tree = res.body.contents;
  expect(tree.map((h) => h.cr_head_id)).toEqual(['1', '2']);
  expect(tree[0].children.map((h) => h.cr_head_id)).toEqual(['1.2', '1.10']);
  expect(tree[0].children[0].subjects.map((s) => s.suj_id)).toEqual(['A']);
  expect(res.body.corseset_group).toEqual({ name_th: 'ป.ตรี' }); // note the misspelt key "corseset_group"
  expect(res.body.major).toBeNull();
});

// ---------- restricted section for a plan (used by GET /plan/view/:id) ----------
test('getCoursesetSubjectRestricted: picks the restrict group of (plan.cr_id, uni, cr_year, cr_seamseter) whose user list contains the PLAN OWNER std_id', async () => {
  useDb([
    [/SELECT \* FROM plan_detail WHERE plan_id/, [{ plan_id: 10, user_uid: 7, cr_id: 5, uni_id: 1, cr_year: '2569', cr_seamseter: '1' }]],
    [/FROM courseset_restrictgrp WHERE cr_id/, [{ cr_restgrp_id: 41 }, { cr_restgrp_id: 42 }]],
    [/FROM restrictgrp_user/, (s, p) => (p[0] === 42 && p[1] === '640001' ? [{ std_id: '640001' }] : [])],
    [/FROM restrictgrp_subject/, [{ suj_id: '0041001', sec: 3 }]],
    [/FROM course_detail WHERE year/, [{ code: '0041001', sec: 3, semester: '1', lecturer: 'x', cr_id: 1 }]],
  ]);
  const r = await CS.getCoursesetSubjectRestricted(rq(7, { plan_id: 10 }));
  expect(r.detail.cr_restgrp_id).toBe(42);
  expect(r.subjects).toHaveLength(1);
  expect(sqlCalls(/FROM courseset_restrictgrp WHERE cr_id/)[0][1]).toEqual([5, 1, '2569', '1']);
});

// ---------- GET .../course/:year/:semester/group (index.js:155) ----------
const groupRules = [
  [/FROM university_detail/, [{ uni_key: 'msu' }]],
  [/FROM university_faculty/, [{ fac_id: 0, fac_key: 'GE' }, { fac_id: 12, fac_key: 'IT' }]],
  [/FROM \s*course_detail/, [{ code: '0041001', total_sec: 3 }, { code: '0042002', total_sec: 1 }, { code: '1204101', total_sec: 2 }]],
];
test('subject groups: fac_id 0 = GE split by templateGE prefixes (0041..), other faculties by 2-digit fac_id prefix; cached 1h', async () => {
  useDb(groupRules);
  const res = mkRes(); await CS.getSubjectGroups(rq(null, { uni_id: 1, year: 2569, semester: 1 }), res);
  const [ge, it] = res.body.data;
  expect(ge.groups[0].subjects.map((s) => s.code)).toEqual(['0041001']);
  expect(ge.groups[1].subjects.map((s) => s.code)).toEqual(['0042002']);
  expect(it.groups).toHaveLength(1);
  expect(it.groups[0]).toMatchObject({ global: true });
  expect(it.groups[0].subjects.map((s) => s.code)).toEqual(['1204101']);
  const set = __redis.ops.find((o) => o[0] === 'set');
  expect(set[1]).toBe('planriean-msu:subjectgroups:2569-1:normal-with_subjects');
  expect(set.slice(3)).toEqual(['EX', 3600]);
});
test('subject groups ?no_subjects=true omits subject lists', async () => {
  useDb(groupRules);
  const res = mkRes(); await CS.getSubjectGroups(rq(null, { uni_id: 1, year: 2569, semester: 1 }, {}, { no_subjects: 'true' }), res);
  expect(res.body.data[1].groups[0].subjects).toBeUndefined();
});
test.todo('BUG-CS-3: ?no_subjects=false (a truthy string) must still include subjects', async () => {
  useDb(groupRules);
  const res = mkRes(); await CS.getSubjectGroups(rq(null, { uni_id: 1, year: 2569, semester: 1 }, {}, { no_subjects: 'false' }), res);
  expect(res.body.data[1].groups[0].subjects).toHaveLength(1);
});
test('lecturer groups endpoint is intentionally empty (PDPA)', async () => {
  const res = mkRes(); await CS.getLectureGroups(rq(null), res);
  expect(res.body).toEqual({ data: [] });
});

// ---------- admin CRUD (index.js:230-262) ----------
test('BUG-ROLE (current behavior): curriculum admin endpoints check no role — any token (even unknown user) can add a course-set', async () => {
  useDb([[/INSERT INTO courseset_detail/, [{}]]]);
  const res = mkRes(); await CS.a_addCoursesetDetail(rq(999, { uni_id: 1 }, { cr_id: 5, name_th: 'x' }), res);
  expect(res.code).toBe(201);
});
test('add course-set subject rejects a duplicate (uni_id, cr_id, suj_id) with 400', async () => {
  useDb([[/SELECT \* FROM courseset_subject WHERE uni_id/, [{}]]]);
  const res = mkRes(); await CS.a_addCoursesetSubject(rq(7, { uni_id: 1, cr_id: 5 }, { suj_id: 'A' }), res);
  expect(res.code).toBe(400);
  expect(res.body.message).toBe('มีวิชานี้ในหลักสูตรอยู่แล้ว');
});
test('edit header returns 404 when (uni_id, cr_id, cr_head_id) does not exist, without UPDATE', async () => {
  const res = mkRes(); await CS.a_editCoursesetHeader(rq(7, { uni_id: 1, cr_id: 5, cr_head_id: '9' }, {}), res);
  expect(res.code).toBe(404);
  expect(sqlCalls(/UPDATE courseset_header/)).toHaveLength(0);
});

// ---------- course-set-group ----------
test('course-set-group: new cr_group_id = MAX(cr_group_id)+1 per university (read-then-insert, not atomic)', async () => {
  useDb([[/MAX\(cr_group_id\)/, [{ max_id: 33 }]], [/INSERT INTO courseset_group/, [{}]]]);
  const res = mkRes(); await CSG.a_addCoursesetGroupDetail(rq(7, { uni_id: 1 }, { name_en: 'Bachelor', name_th: 'ป.ตรี' }), res);
  expect(res.code).toBe(201);
  expect(sqlCalls(/INSERT INTO courseset_group/)[0][1]).toEqual([1, 34, 'Bachelor', 'ป.ตรี']);
});
test('course-set-group: first group of a university gets id 1; edit/delete return 404 when nothing matched', async () => {
  useDb([[/MAX\(cr_group_id\)/, [{ max_id: null }]], [/INSERT INTO courseset_group/, [{}]]]);
  await CSG.a_addCoursesetGroupDetail(rq(7, { uni_id: 2 }, {}), mkRes());
  expect(sqlCalls(/INSERT INTO courseset_group/)[0][1][1]).toBe(1);
  let res = mkRes(); await CSG.a_editCourseSetGroupDetail(rq(7, { uni_id: 2, cr_group_id: 9 }, {}), res);
  expect(res.code).toBe(404);
  res = mkRes(); await CSG.a_removeCoursesetGroupDetail(rq(7, { uni_id: 2, cr_group_id: 9 }), res);
  expect(res.code).toBe(404);
});
