import { test, expect, mock, beforeEach } from 'bun:test';
process.env.SECRET_JWT = 'test-secret-placeholder';
globalThis.__db ??= { handler: async () => ({ rows: [], rowCount: 0 }), calls: [] };
mock.module('../../src/db', () => ({ query: async (t, p) => { __db.calls.push([t, p]); return __db.handler(t, p); } }));
const jwt = require('jwt-simple');
const mkRes = () => { const r = { code: 200, body: undefined, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, send(b) { r.body = b; return r; } }; return r; };
const tok = (c) => jwt.encode(c, process.env.SECRET_JWT);
beforeEach(() => { __db.calls = []; __db.handler = async () => ({ rows: [], rowCount: 0 }); });

const bcrypt = require('bcryptjs');
const { loginMiddleware } = require('../../src/middleware/loginMiddleware');

test('loginMiddleware: correct password -> next()', async () => {
  const hash = await bcrypt.hash('pw', 4);
  __db.handler = async () => ({ rows: [{ username: 'bob', password: hash }], rowCount: 1 });
  let nexted = false;
  await loginMiddleware({ body: { username: 'BOB', password: 'pw' } }, mkRes(), () => { nexted = true; });
  expect(nexted).toBe(true);
  expect(__db.calls[0][0]).toContain('lower(username) = lower($1) OR lower(email) = lower($2)');
});
test('loginMiddleware: wrong password / unknown user / missing body all -> same 401 message (no user enumeration)', async () => {
  const hash = await bcrypt.hash('pw', 4);
  const cases = [
    [async () => ({ rows: [{ password: hash }], rowCount: 1 }), { username: 'bob', password: 'bad' }],
    [async () => ({ rows: [], rowCount: 0 }), { username: 'ghost', password: 'pw' }],
    [async () => ({ rows: [{ password: hash }], rowCount: 1 }), { username: 'bob' }], // bcrypt throws on undefined
  ];
  for (const [h, body] of cases) {
    __db.handler = h;
    const res = mkRes(); let nexted = false;
    await loginMiddleware({ body }, res, () => { nexted = true; });
    expect(nexted).toBe(false);
    expect(res.code).toBe(401);
    expect(res.body).toEqual({ message: 'Invalid Username or password' });
  }
});
test('loginMiddleware: password "null" is refused even when the stored hash matches it (A-AUTH-5 / H11)', async () => {
  // authFromToken registers SSO users with password "null" (login.js:41,138) -> a bcrypt hash of the string "null"
  const hash = await bcrypt.hash('null', 4);
  __db.handler = async () => ({ rows: [{ username: null, password: hash }], rowCount: 1 });
  let nexted = false;
  const res = mkRes();
  await loginMiddleware({ body: { username: 'sso-user-email@x.test', password: 'null' } }, res, () => { nexted = true; });
  expect(nexted).toBe(false);
  expect(res.code).toBe(401);
});

test('requireJWTAuth: reads SECRET_JWT at import and expects the RAW token in the authorization header (no "Bearer ")', async () => {
  const passport = require('passport');
  const { requireJWTAuth } = require('../../src/middleware/requireJWTAuth');
  expect(typeof requireJWTAuth).toBe('function');
  const strat = passport._strategy('jwt');
  expect(strat._jwtFromRequest({ headers: { authorization: 'abc.def' } })).toBe('abc.def');
});

test('normalizeAuthHeader: strips "Bearer " so passport + jwt-simple handlers accept both header styles (H11)', () => {
  const { normalizeAuthHeader } = require('../../src/middleware/requireJWTAuth');
  for (const [inp, out] of [['Bearer abc.def', 'abc.def'], ['bearer  abc.def', 'abc.def'], ['abc.def', 'abc.def']]) {
    const r = { headers: { authorization: inp } };
    normalizeAuthHeader(r, {}, () => {});
    expect(r.headers.authorization).toBe(out);
  }
  const none = { headers: {} };
  normalizeAuthHeader(none, {}, () => {});
  expect(none.headers.authorization).toBeUndefined();
});
