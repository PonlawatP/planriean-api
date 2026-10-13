// M20 / BUG-PLAN-02: custom (edited or user-added) plan subjects live in plan_subject_custom. Mocked db, never touches DB/Redis.
// Book: .feature-books/features/feat-plan.md (bug ids BUG-PLAN-n)
import { test, expect, mock, beforeEach } from 'bun:test';
process.env.SECRET_JWT = 'test-secret-placeholder';
globalThis.__db ??= { handler: async () => ({ rows: [], rowCount: 0 }), calls: [] };
const __q = async (t, p) => { __db.calls.push([t, p]); return __db.handler(t, p); };
mock.module('../../src/db', () => ({ query: __q, connect: async () => ({ query: __q, release() {} }) }));
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
const P = require('../../src/routes/plan');

const USERS = { 7: { uid: 7, uni_id: 1, fac_id: 12, major_id: 3, std_id: '640001' }, 8: { uid: 8, uni_id: 1, fac_id: 5, major_id: null, std_id: '640002' } };
const PLAN = { plan_id: 10, user_uid: 7, plan_name: 'แผน', status: 'personal', is_delete: false, cr_year: '2569', cr_seamseter: '1', cr_id: 5, uni_id: 1 };
const rs = (rows) => ({ rows, rowCount: rows.length });
// rules: [[RegExp, rows | (sql, params) => rows]] checked in order after the auth lookups
function useDb(rules = []) {
  __db.handler = async (sql, p) => {
    if (/FROM user_detail WHERE uid/.test(sql)) return rs(USERS[p[0]] ? [USERS[p[0]]] : []);
    if (/COUNT\(\*\)/.test(sql)) return rs([{ count: 0 }]);
    if (/user_additionrole/.test(sql)) return rs([]);
    for (const [re, v] of rules) if (re.test(sql)) return rs(typeof v === 'function' ? v(sql, p) : v);
    return rs([]);
  };
}
const mkRes = () => { const r = { code: 200, body: undefined, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, send(b) { r.body = b; return r; } }; return r; };
const rq = (uid, params = {}, body = {}) => ({ headers: { authorization: jwt.encode({ uid }, process.env.SECRET_JWT) }, params, body });
const sqlCalls = (re) => __db.calls.filter((c) => re.test(c[0]));
const COURSE = { code: '0041001', sec: 1, year: 2569, semester: 1, name_en: 'Eng', lecturer: 'Dr. X', cr_id: 99, credit: '3(3-0-6)', time: 'Mo13:00-16:00 A' };
const planRules = (plan = PLAN, subjects = [{ code: '0041001', sec: 1, mute_alert: true }]) => [
  [/SELECT \* FROM plan_detail WHERE plan_id/, plan ? [plan] : []],
  [/SELECT user_uid FROM plan_detail/, plan && !plan.is_delete ? [{ user_uid: plan.user_uid }] : []],
  [/SELECT \* FROM plan_subject/, subjects],
  [/SELECT \* FROM course_detail WHERE year/, [COURSE]],
];

beforeEach(() => { __db.calls = []; useDb(); });

const custom = (o = {}) => ({ custom_id: 'c1', year: 2569, semester: 1, code: '0041001', sec: 1, name_th: 'วิชา', name_en: 'Subj', credit: '', time: 'Mo09:00-10:00 B2', source_code: '0041001', source_sec: 1, ...o });
const base = { year: 2569, semester: 1, code: '0041001', sec: 1, mute_alert: false };
const put = (uid, subjects) => { const res = mkRes(); return P.updatePlanSubjectsUser(rq(uid, { plan_id: 10 }, { subjects }), res).then(() => res); };

test('custom beside its original: both stored, base in plan_subject, custom in plan_subject_custom, one transaction', async () => {
  useDb(planRules());
  const res = await put(7, [base, custom(), custom({ custom_id: 'c2' })]);
  expect(res.body.success).toBe(true);
  const all = __db.calls.map((c) => c[0].trim());
  expect(sqlCalls(/INSERT INTO "plan_subject"/)).toHaveLength(1);
  const [ins, vals] = sqlCalls(/INSERT INTO plan_subject_custom/)[0];
  expect(ins).toContain('($1,$2,$3,$4,$5),($1,$6,$7,$8,$9)');
  expect(vals.slice(0, 3)).toEqual([10, 'c1', '0041001']);
  expect(JSON.parse(vals[4])).toEqual({ year: 2569, semester: 1, code: '0041001', sec: 1, name_th: 'วิชา', name_en: 'Subj', credit: '', time: 'Mo09:00-10:00 B2' });
  expect(all.indexOf('BEGIN')).toBeLessThan(all.findIndex((x) => x.includes('DELETE FROM plan_subject_custom')));
  expect(all.indexOf('COMMIT')).toBeGreaterThan(all.findIndex((x) => x.includes('INSERT INTO plan_subject_custom')));
});
test('unknown keys are dropped (whitelist) and never reach the jsonb', async () => {
  useDb(planRules());
  await put(7, [custom({ evil: '<script>', __proto__x: 1, cr_id: 5 })]);
  const data = JSON.parse(sqlCalls(/INSERT INTO plan_subject_custom/)[0][1][4]);
  expect(Object.keys(data)).not.toContain('evil');
  expect(Object.keys(data)).not.toContain('cr_id');
});
test.each([
  ['oversize name', { name_th: 'x'.repeat(256) }],
  ['oversize time', { time: 'x'.repeat(501) }],
  ['non-string code', { code: { a: 1 } }],
  ['bad custom_id', { custom_id: 'a b;drop' }],
  ['missing time', { time: '' }],
  ['float sec', { sec: 1.5 }],
])('negative: %s -> 400 and nothing is deleted', async (_n, o) => {
  useDb(planRules());
  const res = await put(7, [custom(o)]);
  expect(res.code).toBe(400);
  expect(sqlCalls(/DELETE FROM plan_subject/)).toHaveLength(0);
  expect(__db.calls.map((c) => c[0].trim())).not.toContain('BEGIN');
});
test('negative: >100 customs and duplicate custom_id are rejected', async () => {
  useDb(planRules());
  expect((await put(7, Array.from({ length: 101 }, (_, i) => custom({ custom_id: 'k' + i })))).code).toBe(400);
  expect((await put(7, [custom(), custom()])).code).toBe(400);
});
test('non-owner cannot write customs', async () => {
  useDb(planRules());
  const res = await put(8, [custom()]);
  expect(res.code).toBe(403);
  expect(sqlCalls(/plan_subject_custom/)).toHaveLength(0);
});
test('rollback: failing custom INSERT rolls back, no COMMIT', async () => {
  useDb(planRules());
  const h = __db.handler;
  __db.handler = async (t, p) => { if (/INSERT INTO plan_subject_custom/.test(t)) throw { code: '22P02' }; return h(t, p); };
  const res = await put(7, [base, custom()]);
  expect(res.code).toBe(400);
  const all = __db.calls.map((c) => c[0].trim());
  expect(all).toContain('ROLLBACK'); expect(all).not.toContain('COMMIT');
});
test('GET merge: customs are appended as standalone rows next to the real subject (no override of course_detail)', async () => {
  useDb([...planRules(), [/FROM plan_subject_custom/, [
    { custom_key: 'c1', source_code: '0041001', source_sec: 1, data: { code: '0041001', sec: 1, time: 'Mo09:00-10:00 B2', name_th: 'แก้' } },
    { custom_key: 'c2', source_code: null, source_sec: null, data: { code: 'X1', sec: 9, time: 'Tu09:00-10:00', mute_alert: true } },
  ]]]);
  const res = mkRes(); await P.getPlanUser(rq(7, { plan_id: 10 }), res);
  const s = res.body.subjects;
  expect(s).toHaveLength(3);
  expect(s[0].time).toBe(COURSE.time); expect(s[0].custom_id).toBeUndefined();
  expect(s[1]).toMatchObject({ custom_id: 'c1', is_custom: true, source_code: '0041001', source_sec: 1, time: 'Mo09:00-10:00 B2', credit: '', mute_alert: false });
  expect(s[2]).toMatchObject({ custom_id: 'c2', code: 'X1', mute_alert: true });
});
