// Unit tests for src/routes/plan/index.js — the API behind the frontend PLAN page (customer journey).
// Handlers are driven with a fake req/res and a mocked db that records SQL + params. Never touches DB/Redis.
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
  // save: owner check = UPDATE ... WHERE plan_id AND user_uid RETURNING (matches only the owner's row)
  [/UPDATE "plan_detail" SET "update_at"[\s\S]*"user_uid" = \$3/, (sql, p) => (plan && p[2] == plan.user_uid ? [plan] : [])],
  [/SELECT 1 FROM plan_detail WHERE plan_id/, plan ? [{ '?column?': 1 }] : []],
  [/SELECT \* FROM plan_detail WHERE plan_id/, plan ? [plan] : []],
  [/SELECT user_uid FROM plan_detail/, plan && !plan.is_delete ? [{ user_uid: plan.user_uid }] : []],
  [/SELECT \* FROM plan_subject/, subjects],
  [/SELECT \* FROM course_detail WHERE year/, [COURSE]],
];

beforeEach(() => { __db.calls = []; useDb(); });

// ---------- GET /plan/view/:plan_id (index.js:143) ----------
test('owner gets {detail, subjects, restricted}; subjects come from course_detail of the plan term, lecturer stripped, cr_id hidden, mute_alert kept', async () => {
  useDb(planRules());
  const res = mkRes(); await P.getPlanUser(rq(7, { plan_id: 10 }), res);
  expect(res.code).toBe(200);
  expect(Object.keys(res.body)).toEqual(['detail', 'subjects', 'restricted']);
  expect(res.body.subjects).toHaveLength(1);
  expect(res.body.subjects[0].lecturer).toBeUndefined();
  expect(res.body.subjects[0].cr_id).toBeUndefined();
  expect(res.body.subjects[0].mute_alert).toBe(true);
  expect(res.body.restricted).toBeNull();
  // the term used is the PLAN's cr_year/cr_seamseter, not plan_subject.year/seamster
  expect(sqlCalls(/FROM course_detail WHERE year/)[0][1]).toEqual(['2569', '1', 10]);
});

test('non-owner: private plan -> 403, public plan -> 200 (read-only sharing via status="public")', async () => {
  useDb(planRules());
  let res = mkRes(); await P.getPlanUser(rq(8, { plan_id: 10 }), res);
  expect(res.code).toBe(403);
  expect(res.body).toEqual({ success: false, error: 403, msg: 'Plan Not Allow To Aceess' });
  useDb(planRules({ ...PLAN, status: 'public' }));
  res = mkRes(); await P.getPlanUser(rq(8, { plan_id: 10 }), res);
  expect(res.code).toBe(200);
});

test('soft-deleted or missing plan -> 404 "Plan Not Found"', async () => {
  useDb(planRules({ ...PLAN, is_delete: true }));
  const res = mkRes(); await P.getPlanUser(rq(7, { plan_id: 10 }), res);
  expect(res.code).toBe(404);
});

test('WebSocket path (ws_session) returns the error object instead of writing a response', async () => {
  useDb(planRules());
  const out = await P.getPlanUser(null, null, { user: USERS[8], plan_id: 10 });
  expect(out).toEqual({ success: false, error: 403, msg: 'Plan Not Allow To Aceess' });
});

// ---------- DELETE /plan/view/:plan_id (index.js:146) ----------
test('owner can soft-delete own plan (+ its folder children)', async () => {
  useDb(planRules());
  const res = mkRes(); await P.deletePlanUser(rq(7, { plan_id: 10 }), res);
  expect(res.body).toEqual({ success: true });
  expect(sqlCalls(/SET "is_delete" = true/)[0][1]).toEqual([10, 10]);
});
test('H1/BUG-PLAN-1: DELETE by a non-owner must be 403 and must not update plan_detail', async () => {
  useDb(planRules());
  const res = mkRes(); await P.deletePlanUser(rq(8, { plan_id: 10 }), res);
  expect(res.code).toBe(403);
  expect(sqlCalls(/SET "is_delete" = true/)).toHaveLength(0);
});
test('DELETE of a non-existent plan -> 403 (isPlanOwner throws on rows[0] and swallows it)', async () => {
  useDb(planRules(null));
  const res = mkRes(); await P.deletePlanUser(rq(7, { plan_id: 999 }), res);
  expect(res.code).toBe(403);
});

// ---------- GET /plan/view/:plan_id/subject (index.js:147) ----------
test('owner can read subjects of own private plan', async () => {
  useDb(planRules());
  const res = mkRes(); await P.getPlanSubjectsUser(rq(7, { plan_id: 10 }), res);
  expect(res.code).toBe(200);
  expect(res.body.subjects).toHaveLength(1);
});
test('H1/BUG-PLAN-2: GET subjects of a private plan by a non-owner must be 403', async () => {
  useDb(planRules());
  const res = mkRes(); await P.getPlanSubjectsUser(rq(8, { plan_id: 10 }), res);
  expect(res.code).toBe(403);
});

// ---------- PUT /plan/view/:plan_id (index.js:144) ----------
test('PUT plan: non-owner -> 403 and no UPDATE; missing/deleted plan -> 404', async () => {
  useDb(planRules());
  let res = mkRes(); await P.updatePlanUser(rq(8, { plan_id: 10 }, { plan_name: 'x' }), res);
  expect(res.code).toBe(403);
  expect(sqlCalls(/UPDATE "plan_detail"/)).toHaveLength(0);
  useDb(planRules({ ...PLAN, is_delete: true }));
  res = mkRes(); await P.updatePlanUser(rq(7, { plan_id: 10 }, {}), res);
  expect(res.code).toBe(404);
});
test('PUT plan (H5): only sent columns are SET; omitted ones are left alone, uni/fac/major use COALESCE', async () => {
  useDb([...planRules(), [/UPDATE "plan_detail"/, [{ plan_id: 10 }]]]);
  const res = mkRes(); await P.updatePlanUser(rq(7, { plan_id: 10 }, { plan_name: 'ใหม่', status: 'public' }), res);
  expect(res.body.success).toBe(true);
  const [sql, p] = sqlCalls(/UPDATE "plan_detail" SET/)[0];
  expect(sql).toContain('"plan_name" = $5');
  expect(sql).toContain('"status" = $6');
  expect(sql).toContain('COALESCE($1, "uni_id")');
  expect(sql).not.toContain('plan_settings');
  expect(sql).not.toContain('"cr_year"');
  expect(p[0]).toBe(1); expect(p[4]).toBe('ใหม่'); expect(p[5]).toBe('public'); expect(p.at(-1)).toBe(10);
});

// ---------- PUT /plan/view/:plan_id/name (index.js:145) ----------
test('rename enforces ownership inside SQL (WHERE user_uid = caller) and returns 404 when nothing matched', async () => {
  useDb([[/UPDATE "plan_detail" SET "plan_name"/, []]]);
  const res = mkRes(); await P.updatePlanName(rq(8, { plan_id: 10 }, { plan_name: 'n' }), res);
  expect(res.code).toBe(404);
  const p = sqlCalls(/UPDATE "plan_detail" SET "plan_name"/)[0];
  expect(p[0]).toContain('"user_uid" = $4');
  expect(p[1][3]).toBe(8);
});

// ---------- PUT /plan/view/:plan_id/settings (index.js:149) ----------
test('settings: owner updates ONLY plan_settings; non-owner 403', async () => {
  useDb([...planRules(), [/UPDATE "plan_detail" SET "plan_settings"/, [{ plan_id: 10 }]]]);
  const settings = { time_table_type: 'double' };
  let res = mkRes(); await P.updatePlanSettings(rq(7, { plan_id: 10 }, { plan_settings: settings }), res);
  expect(res.body.success).toBe(true);
  expect(sqlCalls(/SET "plan_settings" = \$1 WHERE/)[0][1]).toEqual([settings, 10]);
  res = mkRes(); await P.updatePlanSettings(rq(8, { plan_id: 10 }, { plan_settings: {} }), res);
  expect(res.code).toBe(403);
});

// ---------- POST /plan/create (index.js:142) ----------
const createRules = (sameName = 0) => [
  [/FROM university_detail WHERE uni_key/, [{ uni_id: 1, uni_key: 'MSU' }]],
  [/FROM plan_detail WHERE user_uid = \$1 AND is_delete = false AND plan_name/, Array.from({ length: sameName }, () => ({}))],
  [/INSERT INTO "plan_detail"/, (s, p) => [{ plan_id: 77, plan_name: p[0] }]],
];
const FRONT_CREATE = { plan_name: 'แผน', university: 'MSU', cr_year: 2569, cr_seamseter: 2, cr_id: 1125405, std_year: 6, is_folder: null, ref_folder_plan_id: null, plan_settings: { time_table_type: 'double' } };
test('create: status forced to "personal", uni from body.university key, fac/major from caller profile', async () => {
  useDb(createRules());
  const res = mkRes(); await P.createPlanUser(rq(7, {}, FRONT_CREATE), res);
  expect(res.body.success).toBe(true);
  const p = sqlCalls(/INSERT INTO "plan_detail"/)[0][1];
  expect(p[0]).toBe('แผน');
  expect(p.slice(6, 9)).toEqual([1, 12, 3]);
  expect(p[15]).toBe('personal');
});
test('create: duplicate name gets " (n+1)" where n = count of EXACT same-name live plans', async () => {
  useDb(createRules(1));
  const res = mkRes(); await P.createPlanUser(rq(7, {}, FRONT_CREATE), res);
  expect(res.body.result.plan_name).toBe('แผน (2)');
});
test('BUG-PLAN-3 (current behavior): plan_settings sent by the frontend on create is dropped (INSERT has no plan_settings column)', async () => {
  useDb(createRules());
  await P.createPlanUser(rq(7, {}, FRONT_CREATE), mkRes());
  const [sql, p] = sqlCalls(/INSERT INTO "plan_detail"/)[0];
  expect(sql).not.toContain('plan_settings');
  expect(p).not.toContainEqual(FRONT_CREATE.plan_settings);
});
test.todo('BUG-PLAN-3: create must persist body.plan_settings', async () => {
  useDb(createRules());
  await P.createPlanUser(rq(7, {}, FRONT_CREATE), mkRes());
  expect(sqlCalls(/INSERT INTO "plan_detail"/)[0][1]).toContainEqual(FRONT_CREATE.plan_settings);
});

// ---------- PUT /plan/view/:plan_id/subject (index.js:148) — the "save" of the plan page ----------
const FRONT_SUBJECTS = [ // exactly what planlayout.tsx:312-321 sends
  { year: 2569, semester: 1, code: '0041001', sec: 1, mute_alert: false },
  { year: 2569, semester: 1, code: '1204101', sec: 2, mute_alert: true },
];
test('save subjects: non-owner -> 403 and plan_subject untouched', async () => {
  useDb(planRules());
  const res = mkRes(); await P.updatePlanSubjectsUser(rq(8, { plan_id: 10 }, { subjects: FRONT_SUBJECTS }), res);
  expect(res.code).toBe(403);
  expect(res.body).toEqual({ success: false, error: 403, msg: 'Plan Forbidden' });
  expect(sqlCalls(/DELETE FROM plan_subject/)).toHaveLength(0);
  const all = __db.calls.map((c) => c[0].trim());
  expect(all).toContain('ROLLBACK'); expect(all).not.toContain('COMMIT'); // update_at stamp is not kept either
});
test('save on a missing plan -> 404 "Plan Not Found", nothing committed', async () => {
  useDb(planRules(null));
  const res = mkRes(); await P.updatePlanSubjectsUser(rq(7, { plan_id: 10 }, { subjects: FRONT_SUBJECTS }), res);
  expect(res.code).toBe(404);
  expect(res.body).toEqual({ success: false, error: 404, msg: 'Plan Not Found' });
  expect(__db.calls.map((c) => c[0].trim())).not.toContain('COMMIT');
});
test('save subjects = replace-all inside ONE transaction: BEGIN, owner-checked update_at stamp, DELETE, one multi-row INSERT of 7 params per subject, COMMIT', async () => {
  useDb(planRules());
  await P.updatePlanSubjectsUser(rq(7, { plan_id: 10 }, { subjects: FRONT_SUBJECTS }), mkRes());
  const order = __db.calls.map((c) => c[0]).filter((s) => /plan_subject|update_at/.test(s) && !/SELECT|plan_subject_custom/.test(s));
  const all = __db.calls.map((c) => c[0].trim());
  expect(all.indexOf('BEGIN')).toBeLessThan(all.findIndex((x) => x.includes('"update_at"')));
  expect(all.indexOf('COMMIT')).toBeGreaterThan(all.findIndex((x) => x.includes('INSERT INTO "plan_subject"')));
  expect(order[0]).toContain('"update_at"');
  expect(sqlCalls(/"update_at"/)[0][1].slice(1)).toEqual([10, 7]); // plan_id + caller uid: only the owner's row matches
  expect(order[1]).toContain('DELETE FROM plan_subject');
  expect(order[2]).toContain('INSERT INTO "plan_subject"');
  const [ins, vals] = sqlCalls(/INSERT INTO "plan_subject"/)[0];
  expect(ins).toContain('($1,$2,$3,$4,$5,$6,$7),($8,$9,$10,$11,$12,$13,$14)');
  expect(vals).toEqual([10, 2569, 1, '0041001', 1, false, 1, 10, 2569, 1, '1204101', 2, true, 1]);
});
test('save with an empty list clears the plan (DELETE only, no INSERT)', async () => {
  useDb(planRules(PLAN, []));
  const res = mkRes(); await P.updatePlanSubjectsUser(rq(7, { plan_id: 10 }, { subjects: [] }), res);
  expect(res.body).toEqual({ success: true });
  expect(sqlCalls(/INSERT INTO "plan_subject"/)).toHaveLength(0);
});
test('HTTP save replies only {success:true} and never re-reads the plan (frontend only checks success)', async () => {
  useDb(planRules(PLAN, [{ code: '0041001', sec: 1 }]));
  const res = mkRes(); await P.updatePlanSubjectsUser(rq(7, { plan_id: 10 }, { subjects: [FRONT_SUBJECTS[0]] }), res);
  expect(res.body).toEqual({ success: true });
  expect(sqlCalls(/SELECT/)).toHaveLength(1); // only the user lookup
});
test('BUG-PLAN-5: WS save still returns result = the saved subjects', async () => {
  useDb(planRules(PLAN, [{ code: '0041001', sec: 1 }]));
  const out = await P.updatePlanSubjectsUser(null, null, { user: USERS[7], plan_id: 10 }, { subjects: [FRONT_SUBJECTS[0]] });
  expect(out.success).toBe(true);
  expect(out.result).toHaveLength(1);
});
test('BUG-PLAN-4: invalid body 400s WITHOUT deleting existing plan subjects', async () => {
  useDb(planRules());
  const res = mkRes(); await P.updatePlanSubjectsUser(rq(7, { plan_id: 10 }, {}), res);
  expect(res.code).toBe(400);
  expect(sqlCalls(/DELETE FROM plan_subject/)).toHaveLength(0);
  const all = __db.calls.map((c) => c[0].trim());
  expect(all).toContain('ROLLBACK'); expect(all).not.toContain('COMMIT');
});
test('BUG-PLAN-4: a failing INSERT is rolled back (DELETE never committed)', async () => {
  useDb(planRules());
  const base = __db.handler;
  __db.handler = async (t, p) => { if (/INSERT INTO "plan_subject"/.test(t)) throw { code: '23505' }; return base(t, p); };
  const res = mkRes(); await P.updatePlanSubjectsUser(rq(7, { plan_id: 10 }, { subjects: FRONT_SUBJECTS }), res);
  expect(res.code).toBe(400);
  const all = __db.calls.map((c) => c[0].trim());
  expect(all).toContain('ROLLBACK'); expect(all).not.toContain('COMMIT');
});
test('BUG-PLAN-6: placeholders are always 7 per subject, matching the 7 values', async () => {
  useDb(planRules());
  const subjects = [{ year: 2569, semester: 1, code: '0041001', sec: 1 }];
  await P.updatePlanSubjectsUser(rq(7, { plan_id: 10 }, { subjects }), mkRes());
  const [ins, vals] = sqlCalls(/INSERT INTO "plan_subject"/)[0];
  expect((ins.match(/\$\d+/g) || []).length).toBe(7);
  expect(vals).toHaveLength(7);
});
test('save on a soft-deleted plan is still accepted (no is_delete check in updatePlanSubjectsUser)', async () => {
  useDb(planRules({ ...PLAN, is_delete: true }));
  const res = mkRes(); await P.updatePlanSubjectsUser(rq(7, { plan_id: 10 }, { subjects: FRONT_SUBJECTS }), res);
  expect(res.body.success).toBe(true);
});

// ---------- GET /plan (index.js:141) ----------
test('plan list nests plans under folders (ref_folder-plan_id) and hides soft-deleted top-level items', async () => {
  useDb([[/SELECT \* FROM plan_detail WHERE user_uid/, [
    { plan_id: 1, is_folder: true, is_delete: false },
    { plan_id: 2, 'ref_folder-plan_id': 1, is_delete: false },
    { plan_id: 3, is_delete: false },
    { plan_id: 4, is_delete: true },
  ]]]);
  const res = mkRes(); await P.getListPlanUser(rq(7), res);
  expect(res.body.data.map((p) => p.plan_id)).toEqual([1, 3]);
  expect(res.body.data[0].children.map((p) => p.plan_id)).toEqual([2]);
});
test.todo('BUG-PLAN-7: a soft-deleted plan inside a folder must not be listed as a child', async () => {
  useDb([[/SELECT \* FROM plan_detail WHERE user_uid/, [
    { plan_id: 1, is_folder: true, is_delete: false },
    { plan_id: 2, 'ref_folder-plan_id': 1, is_delete: true },
  ]]]);
  const res = mkRes(); await P.getListPlanUser(rq(7), res);
  expect(res.body.data[0].children).toEqual([]);
});
test('unknown user (token for a deleted account) -> 400 "User Not Found"', async () => {
  const res = mkRes(); await P.getListPlanUser(rq(999), res);
  expect(res.code).toBe(400);
});

// ---------- BUG-PLAN-12: duplicate (plan_id, code, sec) rows ----------
test('BUG-PLAN-12: duplicate sections in the body are collapsed to one row (UNIQUE(plan_id, code, sec) in V2 migration)', async () => {
  useDb(planRules());
  const s = { year: 2569, semester: 1, code: '0041001', sec: 1, mute_alert: false };
  const res = mkRes(); await P.updatePlanSubjectsUser(rq(7, { plan_id: 10 }, { subjects: [s, s] }), res);
  expect(sqlCalls(/INSERT INTO "plan_subject"/)[0][1]).toHaveLength(7);
});
test('BUG-PLAN-12 (current behavior): duplicate plan_subject rows are returned N times by GET plan', async () => {
  const dup = { code: '0041001', sec: 1, mute_alert: false };
  useDb(planRules(PLAN, [dup, dup, dup]));
  const res = mkRes(); await P.getPlanUser(rq(7, { plan_id: 10 }), res);
  expect(res.body.subjects).toHaveLength(3);
});
