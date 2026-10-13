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
test('BUG-PR-2 (current behavior): GET /plan-restrict/view/:restgrp_id/subject always fails (uses :plan_id + an undefined helper) -> 400', async () => {
  const res = mkRes(); await PR.getPlanSubjectsRestricted(rq({ restgrp_id: 41 }), res);
  expect(res.code).toBe(400);
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
test.todo('BUG-ROLE: PUT /plan-restrict/view/:id/subject by a plain user (no admin role) must be 403', async () => {
  const res = mkRes(); await PR.updatePlanSubjectsRestricted(rq({ restgrp_id: 41 }, { subjects: [] }), res);
  expect(res.code).toBe(403);
});
