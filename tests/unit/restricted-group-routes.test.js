// Unit tests for src/routes/restricted-group/index.js (admin-curated "restricted sections" per curriculum/term).
// Book: .feature-books/features/feat-restricted-group.md
import { test, expect, mock, beforeEach } from 'bun:test';
process.env.SECRET_JWT = 'test-secret-placeholder';
globalThis.__db ??= { handler: async () => ({ rows: [], rowCount: 0 }), calls: [] };
mock.module('../../src/db', () => ({ query: async (t, p) => { __db.calls.push([t, p]); return __db.handler(t, p); } }));
const jwt = require('jwt-simple');
const R = require('../../src/routes/restricted-group');

const rs = (rows) => ({ rows, rowCount: rows.length });
function useDb(rules = []) {
  __db.handler = async (sql, p) => {
    if (/FROM user_detail WHERE uid/.test(sql)) return rs(p[0] === 7 ? [{ uid: 7, uni_id: 1 }] : []);
    if (/COUNT\(\*\) AS INT/.test(sql)) return rs([{ count: 0 }]);
    if (/user_additionrole/.test(sql)) return rs([]); // plain "user" role
    for (const [re, v] of rules) if (re.test(sql)) return typeof v === 'function' ? v(sql, p) : rs(v);
    return rs([]);
  };
}
const mkRes = () => { const r = { code: 200, body: undefined, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, send(b) { r.body = b; return r; } }; return r; };
const rq = (uid, params = {}, body = {}, query = {}) => ({ headers: uid == null ? {} : { authorization: jwt.encode({ uid }, process.env.SECRET_JWT) }, params: { uni_id: 1, ...params }, body, query });
const sqlCalls = (re) => __db.calls.filter((c) => re.test(c[0]));
beforeEach(() => { __db.calls = []; useDb(); });

test('list: anonymous -> 404 text; ?cr_id filters by curriculum, empty ?cr_id= means all', async () => {
  let res = mkRes(); await R.getCourseRestrictGroups(rq(null), res);
  expect(res.code).toBe(404);
  expect(res.body).toBe('Courseset Restriction Not Found');
  res = mkRes(); await R.getCourseRestrictGroups(rq(7, {}, {}, { cr_id: '5' }), res);
  expect(sqlCalls(/FROM\s+courseset_restrictgrp\s+JOIN/).at(-1)[1]).toEqual([1, '5']);
  res = mkRes(); await R.getCourseRestrictGroups(rq(7, {}, {}, { cr_id: '' }), res);
  expect(sqlCalls(/FROM\s+courseset_restrictgrp\s+JOIN/).at(-1)[1]).toEqual([1]);
});
test('detail: returns data + subjects + flat list of std_id strings with counts', async () => {
  useDb([
    [/WHERE courseset_restrictgrp.uni_id = \$1 AND courseset_restrictgrp.cr_restgrp_id/, [{ cr_restgrp_id: 41, cr_id: 5 }]],
    [/FROM\s+restrictgrp_subject/, [{ suj_id: '0041001', sec: 3 }]],
    [/FROM\s+restrictgrp_user/, [{ std_id: '640001' }, { std_id: '640002' }]],
  ]);
  const res = mkRes(); await R.getCourseRestrictGroupData(rq(7, { cr_restgrp_id: 41 }), res);
  expect(res.body.users).toEqual(['640001', '640002']);
  expect(res.body.data).toMatchObject({ subject_count: 1, user_count: 2 });
});
test('BUG-ROLE (current behavior): a plain "user" role can create a restricted group (only "is logged in" is checked)', async () => {
  useDb([[/INSERT INTO courseset_restrictgrp/, [{ cr_restgrp_id: 99 }]]]);
  const res = mkRes(); await R.a_addCourseRestrictGroup(rq(7, {}, { cr_id: 5, name_th: 'กลุ่ม', std_year: 2569, term: 1 }), res);
  expect(res.code).toBe(201);
  expect(sqlCalls(/INSERT INTO courseset_restrictgrp/)[0][1]).toEqual([1, 5, undefined, 'กลุ่ม', 2569, 1]);
});
test.todo('BUG-ROLE: creating a restricted group must require an admin/moderator role (403 for plain users)', async () => {
  const res = mkRes(); await R.a_addCourseRestrictGroup(rq(7, {}, { cr_id: 5 }), res);
  expect(res.code).toBe(403);
});
test('BUG-RG-1 (current behavior): "transactions" are BEGIN/COMMIT sent through the shared pool helper db.query (each call may use a different pooled connection)', async () => {
  useDb([[/DELETE FROM courseset_restrictgrp/, [{}]]]);
  await R.a_removeCourseRestrictGroup(rq(7, { cr_restgrp_id: 41 }), mkRes());
  const seq = __db.calls.map((c) => c[0].trim().split(/\s+/).slice(0, 3).join(' ')).filter((s) => /^(BEGIN|COMMIT|ROLLBACK|DELETE)/.test(s));
  expect(seq).toEqual(['BEGIN', 'DELETE FROM restrictgrp_user', 'DELETE FROM restrictgrp_subject', 'DELETE FROM courseset_restrictgrp', 'COMMIT']);
});
test('add users: an already-present std_id aborts the whole batch with 500 (not 409)', async () => {
  useDb([[/SELECT \* FROM restrictgrp_user/, (s, p) => rs(p[1] === 'dup' ? [{}] : [])]]);
  const res = mkRes(); await R.a_addCourseRestrictGroupUsers(rq(7, { cr_restgrp_id: 41 }, { users: ['a', 'dup'] }), res);
  expect(res.code).toBe(500);
  expect(res.body.message).toBe('Failed to add user dup to restriction group 41');
  expect(sqlCalls(/^ROLLBACK$/)).toHaveLength(1);
});
test('replace subjects: DELETE all then INSERT each {suj_id, sec}', async () => {
  useDb([[/INSERT INTO restrictgrp_subject/, [{}]]]);
  const res = mkRes(); await R.a_updateCourseRestrictGroupSubjects(rq(7, { cr_restgrp_id: 41 }, { subjects: [{ suj_id: 'A', sec: 1 }, { suj_id: 'B', sec: 2 }] }), res);
  expect(res.code).toBe(200);
  expect(sqlCalls(/INSERT INTO restrictgrp_subject/).map((c) => c[1])).toEqual([[41, 'A', 1], [41, 'B', 2]]);
});
test('remove subjects builds (suj_id,sec) OR-pairs with cr_restgrp_id as the LAST parameter', async () => {
  useDb([[/DELETE FROM restrictgrp_subject/, [{}]]]);
  await R.a_removeCourseRestrictGroupSubjects(rq(7, { cr_restgrp_id: 41 }, { subjects: [{ suj_id: 'A', sec: 1 }, { suj_id: 'B', sec: 2 }] }), mkRes());
  const [sql, p] = sqlCalls(/DELETE FROM restrictgrp_subject/)[0];
  expect(sql).toContain('cr_restgrp_id = $5 AND ((suj_id = $1 AND sec = $2) OR (suj_id = $3 AND sec = $4))');
  expect(p).toEqual(['A', 1, 'B', 2, 41]);
});
test('BUG-RG-2 (current behavior): remove subjects with an empty list generates invalid SQL "AND ()"', async () => {
  await R.a_removeCourseRestrictGroupSubjects(rq(7, { cr_restgrp_id: 41 }, { subjects: [] }), mkRes());
  expect(sqlCalls(/DELETE FROM restrictgrp_subject/)[0][0]).toContain('AND ()');
});
