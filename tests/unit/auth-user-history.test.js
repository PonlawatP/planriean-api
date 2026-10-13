import { test, expect, mock, beforeEach } from 'bun:test';
process.env.SECRET_JWT = 'test-secret-placeholder';
globalThis.__db ??= { handler: async () => ({ rows: [], rowCount: 0 }), calls: [] };
mock.module('../../src/db', () => ({ query: async (t, p) => { __db.calls.push([t, p]); return __db.handler(t, p); } }));
const jwt = require('jwt-simple');
const mkRes = () => { const r = { code: 200, body: undefined, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, send(b) { r.body = b; return r; } }; return r; };
const tok = (c) => jwt.encode(c, process.env.SECRET_JWT);
beforeEach(() => { __db.calls = []; __db.handler = async () => ({ rows: [], rowCount: 0 }); });
// fake world: users {uid:{uni_id, roles:[{role,uni_id,fac_id,major_id}]}}
const world = (users) => { __db.handler = async (sql, p) => {
  if (/FROM user_detail WHERE uid/.test(sql)) { const u = users[p[0]]; return u ? { rows: [{ uid: +p[0], uni_id: u.uni_id ?? null, password: 'H' }], rowCount: 1 } : { rows: [], rowCount: 0 }; }
  if (/FROM user_additionrole WHERE uid/.test(sql)) { const r = (users[p[0]]?.roles) || []; return { rows: r, rowCount: r.length }; }
  if (/FROM university_detail WHERE uni_id/.test(sql)) return { rows: [{ uni_id: p[0] }], rowCount: 1 };
  if (/SELECT 1 FROM/.test(sql)) return { rows: [{}], rowCount: 1 };
  if (/FROM university_faculty/.test(sql) || /FROM courseset_detail/.test(sql)) return { rows: [{ fac_id: p[1], cr_id: p[0] }], rowCount: 1 };
  if (/plan_detail/.test(sql)) return { rows: [{ count: 0 }], rowCount: 1 };
  if (/INSERT INTO user_additionrole/.test(sql) || /DELETE FROM user_additionrole/.test(sql)) return { rows: [], rowCount: 1 };
  return { rows: [], rowCount: 0 };
}; };

const { getUserSubjectHistory, updateUserSubjectHistory } = require('../../src/routes/user/history');
const asUser = () => { __db.handler = async (sql, p) => {
  if (/FROM user_detail WHERE uid/.test(sql)) return { rows: [{ uid: 1, cr_id: 10, uni_id: 1 }], rowCount: 1 };
  if (/user_additionrole/.test(sql)) return { rows: [], rowCount: 0 };
  if (/plan_detail/.test(sql)) return { rows: [{ count: 0 }], rowCount: 1 };
  if (/user_subjecthistory WHERE uid/.test(sql) && sql.startsWith('SELECT')) return { rows: [
      { subj_id: '0041001', study_term: 1, study_year: 2564, grade: 'F', score: 0 },
      { subj_id: '0041001', study_term: 2, study_year: 2564, grade: 'B', score: 3 }], rowCount: 2 };
  if (/FROM courseset_subject/.test(sql)) return { rows: [{ suj_name_en: 'Subj', suj_name_th: 'วิชา', suj_credit: '3 (3-0-6)', cr_head_id: 4 }], rowCount: 1 };
  return { rows: [], rowCount: 1 }; }; };
const rq = (body) => ({ headers: { authorization: tok({ uid: 1 }) }, params: {}, body });

test('GET history groups multiple attempts of one subject into learning_try[] and parses credit from "3 (3-0-6)"', async () => {
  asUser();
  const res = mkRes(); await getUserSubjectHistory(rq(), res);
  expect(res.body.result).toHaveLength(1);
  expect(res.body.result[0]).toMatchObject({ code: '0041001', credit: '3', suj_name_en: 'Subj', cr_head_id: 4, current_score: 0 });
  expect(res.body.result[0].learning_try.map((t) => t.grade)).toEqual(['F', 'B']);
});

test('GET history: subject not in user\'s course set -> blank names/credit (not an error)', async () => {
  asUser(); const base = __db.handler;
  __db.handler = async (sql, p) => /FROM courseset_subject/.test(sql) ? { rows: [], rowCount: 0 } : base(sql, p);
  const res = mkRes(); await getUserSubjectHistory(rq(), res);
  expect(res.body.result[0]).toMatchObject({ suj_name_en: '', suj_name_th: '', credit: '', cr_head_id: '' });
});

test('GET history with invalid token -> 404 "Courseset Not Found" (misleading status/message)', async () => {
  const res = mkRes(); await getUserSubjectHistory({ headers: { authorization: 'x' }, params: {} }, res);
  expect(res.code).toBe(404);
  expect(res.body).toBe('Courseset Not Found');
});

test('PUT history: replaces ALL rows (DELETE then multi-row INSERT with uid-uni_id from user), scores repeated per attempt', async () => {
  asUser();
  const res = mkRes();
  await updateUserSubjectHistory(rq({ subjects: [{ code: 'A1', current_score: 4, learning_try: [{ semester: 1, year: 2565, grade: 'A' }, { semester: 2, year: 2565, grade: 'B' }] }] }), res);
  const sqls = __db.calls.map((c) => c[0].trim().split(/\s+/).slice(0, 3).join(' '));
  expect(sqls.indexOf('DELETE FROM user_subjecthistory')).toBeLessThan(sqls.findIndex((s) => s.startsWith('INSERT INTO "user_subjecthistory"')));
  const ins = __db.calls.find((c) => c[0].includes('INSERT INTO "user_subjecthistory"'));
  expect(ins[1]).toEqual([1, 'A1', 1, 2565, 'A', 4, 1, 1, 'A1', 2, 2565, 'B', 4, 1]);
  expect(ins[0]).toContain('($1,$2,$3,$4,$5,$6,$7),($8,$9,$10,$11,$12,$13,$14)');
});

test('PUT history with empty subjects clears history and does not INSERT', async () => {
  asUser();
  await updateUserSubjectHistory(rq({ subjects: [] }), mkRes());
  expect(__db.calls.some((c) => c[0].includes('DELETE FROM user_subjecthistory'))).toBe(true);
  expect(__db.calls.some((c) => c[0].includes('INSERT INTO "user_subjecthistory"'))).toBe(false);
});

// BUG A-HIST-1: DELETE and INSERT are separate auto-commit statements (no transaction). If INSERT fails
// (bad grade type, FK, null subj_id) the user's whole history is already deleted.
test('BUG A-HIST-1 (documented): failing INSERT after DELETE leaves history wiped, returns 400', async () => {
  asUser(); const base = __db.handler;
  __db.handler = async (sql, p) => { if (sql.includes('INSERT INTO "user_subjecthistory"')) { const e = new Error('x'); e.code = '23502'; e.detail = 'null value'; throw e; } return base(sql, p); };
  const res = mkRes();
  await updateUserSubjectHistory(rq({ subjects: [{ code: null, learning_try: [{ semester: 1, year: 1, grade: 'A' }] }] }), res);
  expect(res.code).toBe(400);
  expect(__db.calls.some((c) => c[0].includes('DELETE FROM user_subjecthistory'))).toBe(true);
});

test('PUT history without "subjects" -> 400 with undefined error/msg (TypeError not shaped)', async () => {
  asUser();
  const res = mkRes(); await updateUserSubjectHistory(rq({}), res);
  expect(res.code).toBe(400);
  expect(res.body).toEqual({ success: false, error: undefined, msg: undefined });
});

test('PUT history for unknown user returns HTTP 404 with body error 403 "Unauthorize" (status/body mismatch)', async () => {
  const res = mkRes();
  await updateUserSubjectHistory({ headers: { authorization: tok({ uid: 999 }) }, body: { subjects: [] } }, res);
  expect(res.code).toBe(404);
  expect(res.body).toEqual({ success: false, error: 403, msg: 'Unauthorize' });
});
