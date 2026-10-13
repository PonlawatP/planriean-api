import { test, expect, mock, beforeEach, afterAll } from 'bun:test';
process.env.SECRET_JWT = 'test-secret-placeholder';
globalThis.__db ??= { handler: async () => ({ rows: [], rowCount: 0 }), calls: [] };
mock.module('../../src/db', () => ({ query: async (t, p) => { __db.calls.push([t, p]); return __db.handler(t, p); } }));
// fake redis shared across module instances (state lives here, like a real server)
const store = new Map();
const fake = { down: false,
  async get(k) { if (fake.down) throw new Error('down'); return store.has(k) ? String(store.get(k)) : null; },
  async del(k) { if (fake.down) throw new Error('down'); store.delete(k); },
  multi() { const ops = []; const m = { incr(k) { ops.push(['i', k]); return m; }, expire() { return m; },
    async exec() { if (fake.down) throw new Error('down'); for (const [, k] of ops) store.set(k, Number(store.get(k) || 0) + 1); return []; } }; return m; } };
// patch the real client's methods instead of mock.module (bun's module mocks leak into other test files); restored in afterAll
const realRedis = require('../../src/redis');
const orig = { get: realRedis.get, del: realRedis.del, multi: realRedis.multi };
realRedis.get = fake.get; realRedis.del = fake.del; realRedis.multi = fake.multi;
afterAll(() => { Object.assign(realRedis, orig); });
const jwt = require('jwt-simple');
const bcrypt = require('bcryptjs');
const mkRes = () => { const r = { code: 200, body: undefined, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, send(b) { r.body = b; return r; } }; return r; };
const tok = (c) => jwt.encode(c, process.env.SECRET_JWT);
beforeEach(() => { store.clear(); fake.down = false; __db.calls = []; __db.handler = async () => ({ rows: [], rowCount: 0 }); });

const { requireCourseSetRole } = require('../../src/middleware/requireRole');
const { stripBearer, normalizeAuthHeader } = require('../../src/middleware/requireJWTAuth');

// ---- (4) OTP lockout in redis
const otpWorld = async () => { const hash = await bcrypt.hash('111111', 4); __db.handler = async () => ({ rows: [{ otp: hash, otp_expires_at: new Date(Date.now() + 60000) }], rowCount: 1 }); };
const fresh = (n) => import(`../../src/routes/auth/login.js?v=${n}`);
test('OTP: 6th wrong code -> 429, lockout survives a fresh module instance (restart / other replica), key is lowercased email', async () => {
  await otpWorld();
  const a = await fresh('a');
  for (let i = 0; i < 5; i++) { const r = mkRes(); await a.verifyOTP({ body: { email: 'Lock@X.test', otp: '000000' } }, r); expect(r.code).toBe(400); }
  expect([...store.keys()]).toEqual(['planriean:otp_fails:lock@x.test']);
  const b = await fresh('b'); // second "process"
  let r = mkRes(); await b.verifyOTP({ body: { email: 'lock@x.test', otp: '111111' } }, r); expect(r.code).toBe(429);
  r = mkRes(); await b.changePassword({ body: { email: 'LOCK@x.test', otp: '111111', newPassword: 'x' } }, r); expect(r.code).toBe(429);
  r = mkRes(); await b.verifyOTP({ body: { email: 'other@x.test', otp: '111111' } }, r); expect(r.body.success).toBe(true);
});
test('OTP: success resets the counter', async () => {
  await otpWorld();
  const a = await fresh('c');
  for (let i = 0; i < 4; i++) await a.verifyOTP({ body: { email: 'r@x.test', otp: '000000' } }, mkRes());
  let r = mkRes(); await a.verifyOTP({ body: { email: 'r@x.test', otp: '111111' } }, r); expect(r.body.success).toBe(true);
  expect(store.size).toBe(0);
  for (let i = 0; i < 5; i++) { r = mkRes(); await a.verifyOTP({ body: { email: 'r@x.test', otp: '000000' } }, r); expect(r.code).toBe(400); }
});
test('OTP: redis down -> falls back to per-process memory (still locks at 5, not an outage)', async () => {
  await otpWorld(); fake.down = true;
  const a = await fresh('d');
  for (let i = 0; i < 5; i++) { const r = mkRes(); await a.verifyOTP({ body: { email: 'm@x.test', otp: '000000' } }, r); expect(r.code).toBe(400); }
  const r = mkRes(); await a.verifyOTP({ body: { email: 'm@x.test', otp: '111111' } }, r); expect(r.code).toBe(429);
});

// ---- (5) Bearer helper (used by express global middleware and the Elysia websocket register)
test('Bearer: raw and "Bearer " (any case, extra spaces) both reduce to the bare token; non-strings untouched', () => {
  expect(stripBearer('abc.def')).toBe('abc.def');
  expect(stripBearer('Bearer abc.def')).toBe('abc.def');
  expect(stripBearer('bearer   abc.def ')).toBe('abc.def');
  expect(stripBearer(undefined)).toBeUndefined();
  const req = { headers: {} }; let n = false; normalizeAuthHeader(req, null, () => { n = true; });
  expect(n).toBe(true); expect('authorization' in req.headers).toBe(false);
});

// ---- (3) helper faculty / course-set scope
const world = (rows) => { __db.handler = async (sql, p) => {
  if (/FROM user_detail WHERE uid/.test(sql)) return { rows: [{ uid: +p[0], uni_id: 1 }], rowCount: 1 };
  if (/FROM user_additionrole WHERE uid/.test(sql)) { const r = rows[p[0]] || []; return { rows: r, rowCount: r.length }; }
  if (/FROM university_detail/.test(sql)) return { rows: [{ uni_id: p[0] }], rowCount: 1 };
  if (/FROM university_faculty/.test(sql)) return { rows: [{ fac_id: p[1] }], rowCount: 1 };
  if (/FROM courseset_detail WHERE cr_id = \$1 AND uni_id/.test(sql)) return p[0] == 10 ? { rows: [{ fac_id: 5 }], rowCount: 1 } : p[0] == 11 ? { rows: [{ fac_id: 6 }], rowCount: 1 } : { rows: [], rowCount: 0 };
  if (/FROM courseset_detail WHERE cr_id/.test(sql)) return { rows: [{ cr_id: p[0] }], rowCount: 1 };
  if (/plan_detail/.test(sql)) return { rows: [{ count: 0 }], rowCount: 1 };
  return { rows: [], rowCount: 0 };
}; };
const run = async (req) => { const res = mkRes(); let nexted = false; await requireCourseSetRole('helper')({ body: {}, ...req, headers: { authorization: tok({ uid: req.uid }) } }, res, () => { nexted = true; }); return { res, nexted }; };
test('helper scope: faculty helper passes own faculty, 403 on another faculty course-set; course-set helper only its set', async () => {
  world({ 1: [{ role: 'helper', uni_id: 1, fac_id: 5, major_id: null }], 2: [{ role: 'helper', uni_id: 1, fac_id: 5, major_id: 10 }],
          3: [{ role: 'moderator', uni_id: 1, fac_id: null, major_id: null }], 4: [{ role: 'helper', uni_id: 2, fac_id: 5, major_id: null }] });
  const P = (cr_id) => ({ uni_id: '1', cr_id });
  expect((await run({ uid: 1, params: P('10') })).nexted).toBe(true);
  expect((await run({ uid: 1, params: P('11') })).res.code).toBe(403);   // other faculty
  expect((await run({ uid: 2, params: P('10') })).nexted).toBe(true);
  expect((await run({ uid: 3, params: P('11') })).nexted).toBe(true);    // moderator stays university-wide
  expect((await run({ uid: 4, params: P('10') })).res.code).toBe(403);   // other university
  // create: faculty comes from body
  expect((await run({ uid: 1, params: { uni_id: '1' }, body: { fac_id: 5 } })).nexted).toBe(true);
  expect((await run({ uid: 1, params: { uni_id: '1' }, body: { fac_id: 6 } })).res.code).toBe(403);
  expect((await run({ uid: 1, params: { uni_id: '1' }, body: {} })).res.code).toBe(403);
  expect((await run({ uid: 2, params: { uni_id: '1' }, body: { fac_id: 5 } })).res.code).toBe(403); // course-set helper cannot create
});
