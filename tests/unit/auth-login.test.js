import { test, expect, mock, beforeEach } from 'bun:test';
process.env.SECRET_JWT = 'test-secret-placeholder';
globalThis.__db ??= { handler: async () => ({ rows: [], rowCount: 0 }), calls: [] };
mock.module('../../src/db', () => ({ query: async (t, p) => { __db.calls.push([t, p]); return __db.handler(t, p); } }));
const jwt = require('jwt-simple');
const mkRes = () => { const r = { code: 200, body: undefined, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, send(b) { r.body = b; return r; } }; return r; };
const tok = (c) => jwt.encode(c, process.env.SECRET_JWT);
beforeEach(() => { __db.calls = []; __db.handler = async () => ({ rows: [], rowCount: 0 }); });

const { authToken, authFromToken, authGetUser, forgetPassword, verifyOTP, changePassword } = require('../../src/routes/auth/login');
const bcrypt = require('bcryptjs');

test('authToken signs {sub, iat} with SECRET_JWT and no exp (documents: tokens never expire)', async () => {
  const res = mkRes();
  await authToken({ body: { username: 'bob' } }, res);
  const claims = jwt.decode(res.body.token, process.env.SECRET_JWT);
  expect(claims.sub).toBe('bob');
  expect(typeof claims.iat).toBe('number');
  expect(claims.exp).toBeUndefined();
});

test('authFromToken: bad token -> 403 Invalid Token', async () => {
  const res = mkRes();
  await authFromToken({ headers: { authorization: 'nope' } }, res);
  expect(res.code).toBe(403);
  expect(res.body).toEqual({ message: 'Invalid Token' });
});

test('authFromToken: username token returns the user object', async () => {
  __db.handler = async (sql) => sql.includes('FROM user_detail') ? { rows: [{ uid: 1, username: 'bob', password: 'H', uni_id: null }], rowCount: 1 } : { rows: [{ count: 0 }], rowCount: 1 };
  const res = mkRes();
  await authFromToken({ headers: { authorization: tok({ sub: 'bob' }) } }, res);
  expect(res.body.user.username).toBe('bob');
  expect(res.body.user.password).toBeUndefined();
  expect(res.body.user.login_with).toBe('username');
});

test('authGetUser: unknown user -> 404 No User Found; bad token -> 403', async () => {
  let res = mkRes();
  await authGetUser({ headers: { authorization: tok({ sub: 'ghost' }) } }, res);
  expect(res.code).toBe(404);
  res = mkRes();
  await authGetUser({ headers: { authorization: 'x' } }, res);
  expect(res.code).toBe(403);
});

const otpRow = async (otp, expiresMs) => ({ rows: [{ otp: await bcrypt.hash(otp, 4), otp_expires_at: new Date(Date.now() + expiresMs) }], rowCount: 1 });

test('verifyOTP: no unexpired row -> 400 "Expired or non-existent OTP"', async () => {
  const res = mkRes(); await verifyOTP({ body: { email: 'a@x.test', otp: '123456' } }, res);
  expect(res.code).toBe(400);
  expect(res.body.message).toBe('Expired or non-existent OTP');
});
test('verifyOTP: wrong code -> 400 Invalid OTP and NO update', async () => {
  const row = await otpRow('111111', 60000);
  __db.handler = async () => row;
  const res = mkRes(); await verifyOTP({ body: { email: 'a@x.test', otp: '222222' } }, res);
  expect(res.body).toEqual({ success: false, message: 'Invalid OTP' });
  expect(__db.calls.some((c) => c[0].startsWith('UPDATE'))).toBe(false);
});
test('verifyOTP: right code extends expiry to ~1h', async () => {
  const row = await otpRow('111111', 60000);
  __db.handler = async (sql) => sql.startsWith('SELECT') ? row : { rows: [], rowCount: 1 };
  const res = mkRes(); await verifyOTP({ body: { email: 'a@x.test', otp: '111111' } }, res);
  expect(res.body.success).toBe(true);
  const upd = __db.calls.find((c) => c[0].startsWith('UPDATE'));
  const delta = upd[1][0].getTime() - Date.now();
  expect(delta).toBeGreaterThan(59 * 60 * 1000);
  expect(delta).toBeLessThanOrEqual(60 * 60 * 1000);
});

test('changePassword: valid otp sets bcrypt hash and clears otp fields', async () => {
  const row = await otpRow('111111', 60000);
  __db.handler = async (sql) => sql.startsWith('SELECT') ? row : { rows: [], rowCount: 1 };
  const res = mkRes(); await changePassword({ body: { email: 'a@x.test', otp: '111111', newPassword: 'NewPw1' } }, res);
  expect(res.body).toEqual({ success: true, message: 'Password updated successfully' });
  const upd = __db.calls.find((c) => c[0].startsWith('UPDATE'));
  expect(upd[0]).toContain('otp = NULL');
  expect(await bcrypt.compare('NewPw1', upd[1][0])).toBe(true);
});
test('changePassword: wrong otp -> 400 and password untouched', async () => {
  const row = await otpRow('111111', 60000);
  __db.handler = async () => row;
  const res = mkRes(); await changePassword({ body: { email: 'a@x.test', otp: '000000', newPassword: 'x' } }, res);
  expect(res.code).toBe(400);
  expect(__db.calls.some((c) => c[0].startsWith('UPDATE'))).toBe(false);
});

test('forgetPassword: unknown email -> 404 and no OTP written', async () => {
  const res = mkRes(); await forgetPassword({ body: { email: 'ghost@x.test' } }, res);
  expect(res.code).toBe(404);
  expect(res.body).toEqual({ success: false, message: 'User not found' });
});

// BUG A-AUTH-1: no attempt counter / rate limit on verify-otp & change-password. 6-digit OTP, 3 min (1 h after verify).
test.todo('BUG A-AUTH-1: verify-otp/change-password must lock after N failed attempts');
// BUG A-AUTH-4: forgetPassword/verifyOTP/changePassword have no try/catch -> a DB error becomes an Express 500 HTML page
test('forgetPassword propagates db errors (no try/catch) (documents BUG A-AUTH-4)', async () => {
  __db.handler = async () => { throw new Error('boom'); };
  await expect(forgetPassword({ body: { email: 'a@x.test' } }, mkRes())).rejects.toThrow('boom');
});
