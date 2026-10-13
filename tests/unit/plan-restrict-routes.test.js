// Unit tests for src/routes/plan-restrict/index.js (/plan-restrict/view/:restgrp_id — editing a restricted group as if it were a plan).
// Book: .feature-books/features/feat-plan-restrict.md
import { test, expect, mock, beforeEach } from 'bun:test';
process.env.SECRET_JWT = 'test-secret-placeholder';
globalThis.__db ??= { handler: async () => ({ rows: [], rowCount: 0 }), calls: [] };
mock.module('../../src/db', () => ({ query: async (t, p) => { __db.calls.push([t, p]); return __db.handler(t, p); } }));
const jwt = require('jwt-simple');
const PR = require('../../src/routes/plan-restrict');

const rs = (rows) => ({ rows, rowCount: rows.length });
function useDb(rules = []) {
  __db.handler = async (sql, p) => {
    if (/FROM user_detail WHERE uid/.test(sql)) return rs(p[0] === 7 ? [{ uid: 7, uni_id: 1, fac_id: 12, major_id: null }] : []);
    if (/COUNT\(\*\) AS INT/.test(sql)) return rs([{ count: 0 }]);
    if (/user_additionrole/.test(sql)) return rs([]);
    for (const [re, v] of rules) if (re.test(sql)) return rs(typeof v === 'function' ? v(sql, p) : v);
    return rs([]);
  };
}
const mkRes = () => { const r = { code: 200, body: undefined, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, send(b) { r.body = b; return r; } }; return r; };
const rq = (params = {}, body = {}) => ({ headers: { authorization: jwt.encode({ uid: 7 }, process.env.SECRET_JWT) }, params, body });
const sqlCalls = (re) => __db.calls.filter((c) => re.test(c[0]));
const GRP = { cr_restgrp_id: 41, name_th: 'กลุ่ม A', std_year: 2569, term: 1, cr_id: 5, uni_id: 1 };
const rules = [
  [/SELECT \* FROM courseset_restrictgrp WHERE cr_restgrp_id/, [GRP]],
  [/SELECT \* FROM restrictgrp_subject/, [{ suj_id: '0041001', sec: 3 }, { suj_id: '9999999', sec: 1 }]],
  [/SELECT \* FROM course_detail WHERE year/, [{ code: '0041001', sec: 3, semester: 1, lecturer: 'x', cr_id: 1, uni_id: 1 }]],
];
beforeEach(() => { __db.calls = []; useDb(rules); });

test('GET maps a restricted group onto the plan shape: plan_name=name_th, cr_year=std_year, cr_seamseter=term; unknown sections dropped', async () => {
  const res = mkRes(); await PR.getPlanRestricted(rq({ restgrp_id: 41 }), res);
  expect(res.body.detail).toMatchObject({ plan_name: 'กลุ่ม A', cr_year: 2569, cr_seamseter: 1 });
  expect(res.body.subjects).toHaveLength(1);
  expect(res.body.subjects[0].lecturer).toBeUndefined();
});
test('course lookup for restricted subjects is NOT filtered by uni_id (loads every university\'s sections of that term)', async () => {
  await PR.getSubjectDataFromPlanRestrictSubject(41, 2569, 1);
  const [sql, p] = sqlCalls(/FROM course_detail WHERE year/)[0];
  expect(sql).not.toContain('uni_id');
  expect(p).toEqual([2569, 1]);
});
test('BUG-PR-1 (current behavior): PUT /plan-restrict/view/:restgrp_id reads req.params.plan_id (undefined) and UPDATEs plan_detail, never the group', async () => {
  useDb([...rules, [/UPDATE "plan_detail"/, []]]);
  const res = mkRes(); await PR.updatePlanRestricted(rq({ restgrp_id: 41 }, { plan_name: 'x' }), res);
  const [sql, p] = sqlCalls(/UPDATE "plan_detail"/)[0];
  expect(p.at(-1)).toBeUndefined();
  expect(sql).not.toContain('courseset_restrictgrp');
  expect(res.body).toEqual({ success: true, result: undefined }); // reports success for a no-op
});
test.todo('BUG-PR-1: PUT should update courseset_restrictgrp for :restgrp_id', async () => {
  useDb([...rules, [/UPDATE/, [{}]]]);
  await PR.updatePlanRestricted(rq({ restgrp_id: 41 }, { plan_name: 'x' }), mkRes());
  expect(sqlCalls(/UPDATE\s+"?courseset_restrictgrp/)).toHaveLength(1);
});
test('BUG-PR-2 (current behavior): GET /plan-restrict/view/:restgrp_id/subject never returns data (uses :plan_id; H1 guard now fails closed) -> 404/400', async () => {
  const res = mkRes(); await PR.getPlanSubjectsRestricted(rq({ restgrp_id: 41 }), res);
  expect([400, 404]).toContain(res.code);
});
test.todo('BUG-PR-2: GET restricted subjects should return 200 with the group subjects', async () => {
  const res = mkRes(); await PR.getPlanSubjectsRestricted(rq({ restgrp_id: 41 }), res);
  expect(res.code).toBe(200);
});
test('PUT subject replaces the group sections: DELETE + one multi-row INSERT (cr_restgrp_id, code, sec); create_at reused as "last modified"', async () => {
  const res = mkRes(); await PR.updatePlanSubjectsRestricted(rq({ restgrp_id: 41 }, { subjects: [{ code: '0041001', sec: 3, year: 2569, semester: 1 }] }), res);
  expect(res.body.success).toBe(true);
  expect(sqlCalls(/DELETE FROM restrictgrp_subject/)[0][1]).toEqual([41]);
  expect(sqlCalls(/INSERT INTO "restrictgrp_subject"/)[0][1]).toEqual([41, '0041001', 3]);
  expect(sqlCalls(/SET "create_at"/)).toHaveLength(1);
});
const { requireRestrictGroupRole } = require('../../src/middleware/requireRole');
// users: {uid: [{role, uni_id|null}]}; group 41 belongs to uni 1, group 42 to uni 2
function authzWorld(users) {
  __db.handler = async (sql, p) => {
    if (/FROM courseset_restrictgrp WHERE cr_restgrp_id/.test(sql)) return rs({ 41: [{ uni_id: 1 }], 42: [{ uni_id: 2 }] }[p[0]] || []);
    if (/FROM user_detail WHERE uid/.test(sql)) return rs(users[p[0]] ? [{ uid: +p[0], uni_id: 1 }] : []);
    if (/FROM university_detail WHERE uni_id/.test(sql)) return rs([{ uni_id: p[0] }]);
    if (/COUNT\(\*\) AS INT/.test(sql)) return rs([{ count: 0 }]);
    if (/user_additionrole/.test(sql)) return rs((users[p[0]] || []).map((x) => ({ role: x.role, uni_id: x.uni_id, fac_id: null, major_id: null })));
    return rs([]);
  };
}
async function guard(uid, params, min = 'helper') {
  const res = mkRes(); let nexted = false;
  await requireRestrictGroupRole(min)({ headers: { authorization: jwt.encode({ uid }, process.env.SECRET_JWT) }, params }, res, () => { nexted = true; });
  return { code: res.code, nexted };
}
test('BUG-ROLE fixed: restricted-group write guard — student 403, other-university helper 403, correct helper OK, missing group 404', async () => {
  authzWorld({ 1: [], 2: [{ role: 'helper', uni_id: 1 }], 3: [{ role: 'helper', uni_id: 2 }], 4: [{ role: 'admin', uni_id: null }] });
  expect((await guard(1, { restgrp_id: 41 })).code).toBe(403); // plain student
  expect((await guard(3, { restgrp_id: 41 })).code).toBe(403); // helper of another university
  expect((await guard(2, { restgrp_id: 41 })).nexted).toBe(true); // helper of owning university
  expect((await guard(4, { restgrp_id: 41 })).nexted).toBe(true); // global admin
  expect((await guard(2, { restgrp_id: 999 })).code).toBe(404); // missing group
  expect((await guard(2, { restgrp_id: 'x' })).code).toBe(404); // non-numeric id
  // /university/:uni_id/restrict/:id — URL uni must own the group (blocks helper-of-uni-1 reaching uni-2 group)
  expect((await guard(2, { uni_id: 1, cr_restgrp_id: 41 })).nexted).toBe(true);
  expect((await guard(2, { uni_id: 1, cr_restgrp_id: 42 })).code).toBe(404);
  expect((await guard(2, { uni_id: 2, cr_restgrp_id: 42 })).code).toBe(403);
});
test('BUG-ROLE fixed: index.js wires the guard on every restricted-group write route', async () => {
  const src = await Bun.file(import.meta.dir + '/../../src/index.js').text();
  const writes = src.split('\n').filter((l) => /^app\.(post|put|delete)\(\s*"(\/plan-restrict|\/university\/:uni_id\/restrict\/:cr_restgrp_id)/.test(l));
  expect(writes.length).toBe(10);
  for (const l of writes) expect(l).toContain('requireRestrictGroupRole("helper")');
});
