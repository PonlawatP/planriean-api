import { test, expect, mock, beforeEach } from 'bun:test';
process.env.SECRET_JWT = 'test-secret-placeholder';
globalThis.__db ??= { handler: async () => ({ rows: [], rowCount: 0 }), calls: [] };
mock.module('../../src/db', () => ({ query: async (t, p) => { __db.calls.push([t, p]); return __db.handler(t, p); } }));
const jwt = require('jwt-simple');
const mkRes = () => { const r = { code: 200, body: undefined, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, send(b) { r.body = b; return r; } }; return r; };
beforeEach(() => { __db.calls = []; __db.handler = async () => ({ rows: [], rowCount: 0 }); });

const U = require('../../src/utils/userutil');

test('encryptPassword produces a salted bcrypt hash that verifies', async () => {
  const bcrypt = require('bcryptjs');
  const h1 = await U.encryptPassword('pw123');
  const h2 = await U.encryptPassword('pw123');
  expect(h1).not.toBe('pw123');
  expect(h1).not.toBe(h2); // random salt
  expect(await bcrypt.compare('pw123', h1)).toBe(true);
  expect(await bcrypt.compare('other', h1)).toBe(false);
});

test('checkUsername / checkEmail return true when AVAILABLE (0 rows) and compare case-insensitively', async () => {
  expect(await U.checkUsername('Bob')).toBe(true);
  expect(__db.calls.at(-1)[0]).toContain('lower(username) = lower($1)');
  __db.handler = async () => ({ rows: [{}], rowCount: 1 });
  expect(await U.checkEmail('a@b.c')).toBe(false);
});

test('getUserRoles: user with no addition roles gets a single synthetic "user" role', async () => {
  __db.handler = async (sql) => sql.includes('user_additionrole') ? { rows: [], rowCount: 0 } : { rows: [{ uni_id: 1, uni_key: 'MSU' }], rowCount: 1 };
  const roles = await U.getUserRoles({ uid: 9, uni_id: 1 });
  expect(roles).toEqual([{ role: 'user', university: { uni_id: 1, uni_key: 'MSU' }, faculty: null, major: null }]);
});

test('getUserRoles: maps addition roles; null uni/fac/major stay null', async () => {
  __db.handler = async (sql) => {
    if (sql.includes('user_additionrole')) return { rows: [{ role: 'admin', uni_id: null, fac_id: null, major_id: null }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  expect(await U.getUserRoles({ uid: 9, uni_id: null })).toEqual([{ role: 'admin', university: null, faculty: null, major: null }]);
});

test('getUserFromUID strips password and adds plan_created + roles', async () => {
  __db.handler = async (sql) => {
    if (sql.includes('FROM user_detail')) return { rows: [{ uid: 3, username: 'u', password: 'HASH', uni_id: null }], rowCount: 1 };
    if (sql.includes('plan_detail')) return { rows: [{ count: 4 }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  const u = await U.getUserFromUID(3);
  expect(u.password).toBeUndefined();
  expect(u.plan_created).toBe(4);
  expect(u.roles[0].role).toBe('user');
  expect(await U.getUserFromUID(3, true).then((x) => x.password)).toBe('HASH');
});

test('getUserFromUID returns null when no row / on db error', async () => {
  expect(await U.getUserFromUID(1)).toBeNull();
  __db.handler = async () => { throw new Error('x'); };
  expect(await U.getUserFromUID(1)).toBeNull();
});

test('getUserFromRequest picks lookup column from token claims (uid > sub > email)', async () => {
  const seen = [];
  __db.handler = async (sql, p) => { seen.push([sql, p]); return { rows: [], rowCount: 0 }; };
  const mk = (claims) => ({ headers: { authorization: jwt.encode(claims, process.env.SECRET_JWT) } });
  await U.getUserFromRequest(mk({ uid: 5 }));
  expect(seen.at(-1)[0]).toContain('uid = $1'); expect(seen.at(-1)[1]).toEqual([5]);
  await U.getUserFromRequest(mk({ sub: 'bob' }));
  expect(seen.at(-1)[0]).toContain('username = $1');
  await U.getUserFromRequest(mk({ email: 'a@b.c' }));
  expect(seen.at(-1)[0]).toContain('email = LOWER($1)');
  await U.getUserFromRequest(mk({ login_with: 'auth-msu', auth_reg_username: '64010912345' }));
  expect(seen.at(-1)[0]).toContain('auth_reg_username');
});

test('getUserFromRequest returns null on bad signature or missing header', async () => {
  expect(await U.getUserFromRequest({ headers: {} })).toBeNull();
  expect(await U.getUserFromRequest({ headers: { authorization: jwt.encode({ uid: 1 }, 'other-secret') } })).toBeNull();
});

test('getUsers (no search/role/uni): paginates with LIMIT/OFFSET and computes last_page', async () => {
  __db.handler = async (sql) => sql.includes('COUNT') ? { rows: [{ total: 51 }], rowCount: 1 } : { rows: [], rowCount: 0 };
  const r = await U.getUsers(0, 2, 25, '', '');
  expect(r.pagination).toEqual({ totalItem: 51, totalPage: 3, page: 2, limit: 25, offset: 25 });
});

// BUG A-USER-1: getUsers() with search + role and NO uni filter builds the role clause with $3 but only
// passes [search, role] (+ limit/offset) -> "could not determine data type of parameter" / wrong binding.
test.failing('BUG A-USER-1: getUsers(search+role, uni_id=0) uses placeholder numbers consistent with params (documents BUG A-USER-1)', async () => {
  await U.getUsers(0, 1, 25, 'bob', 'admin').catch(() => {});
  const [sql, params] = __db.calls[0];
  const maxPlaceholder = Math.max(...[...sql.matchAll(/\$(\d+)/g)].map((m) => +m[1]));
  expect(params.length).toBe(maxPlaceholder);
});
