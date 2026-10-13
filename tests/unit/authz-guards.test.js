import { test, expect, mock, beforeEach } from 'bun:test';
process.env.SECRET_JWT = 'test-secret-placeholder';
globalThis.__db ??= { handler: async () => ({ rows: [], rowCount: 0 }), calls: [] };
mock.module('../../src/db', () => ({ query: async (t, p) => { __db.calls.push([t, p]); return __db.handler(t, p); } }));
const jwt = require('jwt-simple');
const bcrypt = require('bcryptjs');
const mkRes = () => { const r = { code: 200, body: undefined, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, send(b) { r.body = b; return r; } }; return r; };
const tok = (c) => jwt.encode(c, process.env.SECRET_JWT);
beforeEach(() => { __db.calls = []; __db.handler = async () => ({ rows: [], rowCount: 0 }); });

const { requireRole } = require('../../src/middleware/requireRole');
const { getAllUsers } = require('../../src/routes/users');
const { verifyOTP, changePassword } = require('../../src/routes/auth/login');

// users: {uid: [{role, uni_id|null}]}
const world = (users) => { __db.handler = async (sql, p) => {
  if (/FROM user_detail WHERE uid/.test(sql)) return users[p[0]] ? { rows: [{ uid: +p[0], uni_id: 1 }], rowCount: 1 } : { rows: [], rowCount: 0 };
  if (/FROM user_additionrole WHERE uid/.test(sql)) { const r = (users[p[0]] || []).map((x) => ({ role: x.role, uni_id: x.uni_id, fac_id: null, major_id: null })); return { rows: r, rowCount: r.length }; }
  if (/FROM university_detail WHERE uni_id/.test(sql)) return { rows: [{ uni_id: p[0] }], rowCount: 1 };
  if (/plan_detail/.test(sql)) return { rows: [{ count: 0 }], rowCount: 1 };
  if (/COUNT\(ud/.test(sql)) return { rows: [{ total: 0 }], rowCount: 1 };
  return { rows: [], rowCount: 0 };
}; };
const ctx = (uid, params = {}, query = {}) => ({ headers: uid == null ? {} : { authorization: tok({ uid }) }, params, query });
const run = async (mw, req) => { const res = mkRes(); let nexted = false; await mw(req, res, () => { nexted = true; }); return { res, nexted }; };

test('H3: requireRole denies no-token, plain student, wrong-university helper; allows scoped + global', async () => {
  world({ 1: [], 2: [{ role: 'helper', uni_id: 1 }], 3: [{ role: 'helper', uni_id: 2 }], 4: [{ role: 'admin', uni_id: null }], 5: [{ role: 'admin', uni_id: 1 }] });
  const h = requireRole('helper');
  expect((await run(h, ctx(null, { uni_id: 1 }))).res.code).toBe(403);
  expect((await run(h, ctx(1, { uni_id: 1 }))).res.code).toBe(403);
  expect((await run(h, ctx(3, { uni_id: 1 }))).res.code).toBe(403);
  expect((await run(h, ctx(2, { uni_id: 1 }))).nexted).toBe(true);
  expect((await run(h, ctx(4, { uni_id: 7 }))).nexted).toBe(true);
  // helper cannot pass an admin-only route
  expect((await run(requireRole('admin'), ctx(2, { uni_id: 1 }))).res.code).toBe(403);
  // creating a university needs a GLOBAL admin
  const g = requireRole('admin', 'global');
  expect((await run(g, ctx(5))).res.code).toBe(403);
  expect((await run(g, ctx(4))).nexted).toBe(true);
});

test('H4: GET users needs helper+ in scope; limit is capped at 100', async () => {
  world({ 1: [], 2: [{ role: 'helper', uni_id: 1 }], 3: [{ role: 'helper', uni_id: 2 }] });
  let res = mkRes(); await getAllUsers(ctx(1, { uni_id: 1 }), res); expect(res.code).toBe(403);
  res = mkRes(); await getAllUsers(ctx(3, { uni_id: 1 }), res); expect(res.code).toBe(403);
  res = mkRes(); await getAllUsers(ctx(3, { uni_id: 0 }), res); expect(res.code).toBe(403); // all-university listing needs a global role
  res = mkRes(); await getAllUsers({ headers: { authorization: 'garbage' }, params: { uni_id: 1 }, query: {} }, res); expect(res.code).toBe(403);
  res = mkRes(); await getAllUsers(ctx(2, { uni_id: 1 }, { limit: '100000' }), res);
  expect(res.code).toBe(200);
  expect(res.body.pagination.limit).toBe(100);
});

test('H11: OTP verify/change-password lock after 5 wrong codes (even for a later correct code), per email', async () => {
  const hash = await bcrypt.hash('111111', 4);
  const row = { rows: [{ otp: hash, otp_expires_at: new Date(Date.now() + 60000) }], rowCount: 1 };
  __db.handler = async (sql) => (sql.startsWith('SELECT') ? row : { rows: [], rowCount: 1 });
  const email = 'lock@x.test';
  // lockout state lives in redis now: swap in an in-memory counter for this test only (restored in finally)
  const rd = require('../../src/redis'); const keep = { get: rd.get, del: rd.del, multi: rd.multi }; const kv = new Map();
  rd.get = async (k) => kv.get(k) ?? null; rd.del = async (k) => { kv.delete(k); };
  rd.multi = () => { const m = { incr(k) { m.k = k; return m; }, expire() { return m; }, async exec() { kv.set(m.k, Number(kv.get(m.k) || 0) + 1); } }; return m; };
  try {
  for (let i = 0; i < 5; i++) { const r = mkRes(); await verifyOTP({ body: { email, otp: '000000' } }, r); expect(r.code).toBe(400); }
  let r = mkRes(); await verifyOTP({ body: { email, otp: '111111' } }, r); expect(r.code).toBe(429);
  r = mkRes(); await changePassword({ body: { email, otp: '111111', newPassword: 'x' } }, r); expect(r.code).toBe(429);
  expect(__db.calls.some((c) => c[0].startsWith('UPDATE'))).toBe(false);
  // other email unaffected; success resets the counter
  r = mkRes(); await verifyOTP({ body: { email: 'other@x.test', otp: '111111' } }, r); expect(r.body.success).toBe(true);
  } finally { Object.assign(rd, keep); }
});

test('H11: user lookups never expose the otp columns', async () => {
  const { getUserFromUsername } = require('../../src/utils/userutil');
  __db.handler = async (sql) => /FROM user_detail/.test(sql)
    ? { rows: [{ uid: 1, username: 'a', password: 'h', otp: 'hashedotp', otp_expires_at: new Date(), otp_created_at: new Date(), uni_id: null }], rowCount: 1 }
    : { rows: [{ count: 0 }], rowCount: 0 };
  const out = JSON.parse(JSON.stringify(await getUserFromUsername('a')));
  expect(out.user.otp).toBeUndefined(); expect(out.user.otp_expires_at).toBeUndefined(); expect(out.user.password).toBeUndefined();
});
