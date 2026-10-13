import { test, expect, mock, beforeEach } from 'bun:test';
process.env.SECRET_JWT = 'test-secret-placeholder';
globalThis.__db ??= { handler: async () => ({ rows: [], rowCount: 0 }), calls: [] };
mock.module('../../src/db', () => ({ query: async (t, p) => { __db.calls.push([t, p]); return __db.handler(t, p); } }));
const jwt = require('jwt-simple');
const mkRes = () => { const r = { code: 200, body: undefined, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, send(b) { r.body = b; return r; } }; return r; };
const tok = (c) => jwt.encode(c, process.env.SECRET_JWT);
beforeEach(() => { __db.calls = []; __db.handler = async () => ({ rows: [], rowCount: 0 }); });

const { registerUser, updateUser, updateFSUser, checkEmailUser, checkUsernameUser } = require('../../src/routes/auth/register');

const regBody = (o = {}) => ({ username: 'bob', password: 'pw', uni_id: 1, fac_id: 2, major_id: null, std_id: '64010912345', cr_id: 3, image: null, std_name: 'Bob', std_surname: 'S', phone: '0800000000', email: 'b@x.test', auth_reg_username: null, std_start_year: '2564', ...o });

test('registerUser inserts hashed password (never plaintext) and responds {success:true}', async () => {
  const res = mkRes();
  expect(await registerUser({ body: regBody() }, res)).toBe(true);
  expect(res.body).toEqual({ success: true });
  const [sql, p] = __db.calls[0];
  expect(sql).toContain('INSERT INTO "public"."user_detail"');
  expect(p[1]).not.toBe('pw');
  expect(p[1]).toMatch(/^\$2[aby]\$/);
});

test('sanitizeInput (via registerUser): strips <script> + html tags, trims, keeps integers, undefined -> null', async () => {
  await registerUser({ body: regBody({ std_name: '  <script>alert(1)</script>Bob<b>x</b> ', uni_id: 7, phone: undefined }) }, mkRes());
  const p = __db.calls[0][1];
  expect(p[8]).toBe('Bobx'); // std_name
  expect(p[2]).toBe(7);      // uni_id integer kept
  expect(p[10]).toBeNull();  // phone undefined -> null
});

test('registerUser db error -> 400 {success:false,error:code,msg:detail}', async () => {
  __db.handler = async () => { const e = new Error('dup'); e.code = '23505'; e.detail = 'Key (username)=(bob) already exists.'; throw e; };
  const res = mkRes();
  expect(await registerUser({ body: regBody() }, res)).toBe(false);
  expect(res.code).toBe(400);
  expect(res.body).toEqual({ success: false, error: '23505', msg: 'Key (username)=(bob) already exists.' });
});

// BUG A-AUTH-2: sanitizeInput only handles string/integer; boolean / float / object throws TypeError (.replace)
test('registerUser with non-string non-integer field (e.g. float year) -> 400 with error -1 (documents BUG A-AUTH-2)', async () => {
  const res = mkRes();
  await registerUser({ body: regBody({ std_start_year: 2564.5 }) }, res);
  expect(res.code).toBe(400);
  expect(res.body.error).toBe(-1);
});

test('registerUser has no server-side password policy: empty password still registers (documents BUG A-AUTH-3)', async () => {
  const res = mkRes();
  await registerUser({ body: regBody({ password: '' }) }, res);
  expect(res.body).toEqual({ success: true });
});

test('checkEmailUser: blank -> false without DB; available -> true; taken -> false', async () => {
  let res = mkRes(); await checkEmailUser({ body: { email: '   ' } }, res);
  expect(res.body).toBe(false); expect(__db.calls).toHaveLength(0);
  res = mkRes(); await checkEmailUser({ body: { email: 'new@x.test' } }, res);
  expect(res.body).toBe(true);
  __db.handler = async () => ({ rows: [{}], rowCount: 1 });
  res = mkRes(); await checkEmailUser({ body: { email: 'new@x.test' } }, res);
  expect(res.body).toBe(false);
});

test('checkUsernameUser: missing username -> 400 (TypeError on .trim)', async () => {
  const res = mkRes(); await checkUsernameUser({ body: {} }, res);
  expect(res.code).toBe(400);
});

// ---- PUT /user (profile page save) ----
const putUser = async (claims, body) => {
  __db.handler = async (sql) => sql.includes('FROM user_detail') ? { rows: [{ uid: 1, password: 'H', uni_id: null }], rowCount: 1 } : { rows: [{ count: 0 }], rowCount: 1 };
  const res = mkRes();
  await updateUser({ headers: { authorization: tok(claims) }, body }, res);
  return res;
};

test('updateUser targets row by uid > email > auth_reg_username (msu) from token', async () => {
  await putUser({ uid: 11 }, { std_id: '64010912345' });
  expect(__db.calls[0][0]).toContain('WHERE uid = $11'); expect(__db.calls[0][1].at(-1)).toBe(11);
  await putUser({ email: 'e@x.test' }, {});
  expect(__db.calls.find((c) => c[0].includes('UPDATE') && c[1].at(-1) === 'e@x.test')[0]).toContain('WHERE email = $11');
  await putUser({ login_with: 'auth-msu', auth_reg_username: '64010912345' }, {});
  expect(__db.calls.some((c) => c[0].includes('WHERE auth_reg_username = $11'))).toBe(true);
});

test('updateUser std_id must be exactly 11 chars, otherwise it is stored as "" (not rejected)', async () => {
  await putUser({ uid: 1 }, { std_id: '123' });
  expect(__db.calls[0][1][3]).toBe('');
  await putUser({ uid: 1 }, { std_id: '64010912345' });
  expect(__db.calls.filter((c) => c[0].includes('UPDATE')).at(-1)[1][3]).toBe('64010912345');
});

// BUG A-PROFILE-1: PUT /user is a FULL overwrite. Every omitted field becomes NULL and std_id becomes "".
test.failing('BUG A-PROFILE-1: a partial PUT /user (only std_name) must NOT null-out other columns', async () => {
  await putUser({ uid: 1 }, { std_name: 'Only' });
  const p = __db.calls[0][1];
  // expected after fix: untouched columns not sent / preserved. Current: uni_id, fac_id, cr_id, email, username, image all null
  expect([p[0], p[1], p[2], p[7], p[8], p[9]].every((v) => v === null)).toBe(false);
});

test('updateUser returns the refreshed user FLAT (no {user:} wrapper, unlike GET /user) with password stripped (BUG A-PROFILE-3: inconsistent shape)', async () => {
  const res = await putUser({ uid: 1 }, { std_name: 'N' });
  expect(res.body.user).toBeUndefined();
  expect(res.body.uid).toBe(1);
  expect(res.body.password).toBeUndefined();
});

test('updateUser with bad token -> 400 (jwt decode error is swallowed into the db-error shape)', async () => {
  const res = mkRes();
  await updateUser({ headers: { authorization: 'garbage' }, body: {} }, res);
  expect(res.code).toBe(400);
  expect(res.body.success).toBe(false);
});

// ---- PUT /user/update/fs (NOT behind requireJWTAuth in src/index.js:139) ----
test('updateFSUser: looks up by token.email or token.username; app tokens carry "sub" not "username" -> WHERE username = undefined (documents BUG A-PROFILE-2)', async () => {
  __db.handler = async () => ({ rows: [], rowCount: 0 });
  await updateFSUser({ headers: { authorization: tok({ sub: 'bob' }) }, body: { uni_id: 1, fac_id: 1, major_id: null, std_id: '64010912345', cr_id: 1, std_start_year: '2564' } }, mkRes());
  const upd = __db.calls.find((c) => c[0].includes('UPDATE'));
  expect(upd[0]).toContain('WHERE username = $7');
  expect(upd[1].at(-1)).toBeUndefined();
});

test('updateFSUser without std_id -> TypeError -> 400', async () => {
  const res = mkRes();
  await updateFSUser({ headers: { authorization: tok({ email: 'e@x.test' }) }, body: {} }, res);
  expect(res.code).toBe(400);
});
