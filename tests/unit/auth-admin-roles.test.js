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

const { a_addUserRole, a_editUserRole, a_deleteUserRole } = require('../../src/routes/users');
const req = (actorUid, params, body) => ({ headers: { authorization: tok({ uid: actorUid }) }, params, body });
const inserts = () => __db.calls.filter((c) => c[0].includes('INSERT INTO user_additionrole'));

test('plain user / helper cannot add roles (index <= 1) -> 403', async () => {
  world({ 1: { uni_id: 1, roles: [] }, 2: { uni_id: 1, roles: [] }, 3: { uni_id: 1, roles: [{ role: 'helper', uni_id: 1, fac_id: 1, major_id: null }] } });
  for (const actor of [1, 3]) {
    const res = mkRes();
    await a_addUserRole(req(actor, { param_uni_id: 1, uid: 2 }, { uni_id: 1, fac_id: 1, role: 'helper' }), res);
    expect(res.code).toBe(403);
  }
  expect(inserts()).toHaveLength(0);
});

test('moderator(uni 1) adds helper to a user in uni 1 -> 201 and inserts row', async () => {
  world({ 1: { uni_id: 1, roles: [{ role: 'moderator', uni_id: 1, fac_id: null, major_id: null }] }, 2: { uni_id: 1, roles: [] } });
  const res = mkRes();
  await a_addUserRole(req(1, { param_uni_id: 1, uid: 2 }, { uni_id: 1, fac_id: 1, role: 'helper' }), res);
  expect(res.code).toBe(201);
  expect(inserts()[0][1]).toEqual([2, 1, undefined, 1, 'helper']);
});

test('helper role needs uni+faculty, moderator needs uni (403 with message)', async () => {
  world({ 1: { uni_id: 1, roles: [{ role: 'moderator', uni_id: 1 }] }, 2: { uni_id: 1, roles: [] } });
  let res = mkRes();
  await a_addUserRole(req(1, { uid: 2 }, { uni_id: 1, role: 'helper' }), res);
  expect(res.body.message).toBe('Please insert university and Faculty.');
  res = mkRes();
  await a_addUserRole(req(1, { uid: 2 }, { role: 'moderator' }), res);
  expect(res.body.message).toBe('Please insert university.');
});

test('uni-scoped moderator cannot add a role for ANOTHER university -> 403', async () => {
  world({ 1: { uni_id: 1, roles: [{ role: 'moderator', uni_id: 1 }] }, 2: { uni_id: 2, roles: [] } });
  const res = mkRes();
  await a_addUserRole(req(1, { uid: 2 }, { uni_id: 2, fac_id: 1, role: 'helper' }), res);
  expect(res.body.message).toBe('Cannot add permission to different university.');
});

test('duplicate role -> 406', async () => {
  world({ 1: { uni_id: 1, roles: [{ role: 'moderator', uni_id: 1 }] }, 2: { uni_id: 1, roles: [{ role: 'helper', uni_id: 1, fac_id: 1, major_id: null }] } });
  const res = mkRes();
  await a_addUserRole(req(1, { uid: 2 }, { uni_id: 1, fac_id: 1, role: 'helper' }), res);
  expect(res.code).toBe(406);
});

// BUG A-ROLE-1 (privilege escalation): roleGrant compares the actor against the TARGET's current role, never
// against the role being granted. A moderator can therefore mint an "admin" for a plain user of their university.
test.failing('BUG A-ROLE-1: moderator must NOT be able to grant role "admin"', async () => {
  world({ 1: { uni_id: 1, roles: [{ role: 'moderator', uni_id: 1 }] }, 2: { uni_id: 1, roles: [] } });
  const res = mkRes();
  await a_addUserRole(req(1, { uid: 2 }, { uni_id: 1, role: 'admin' }), res);
  expect(res.code).toBe(403);
});

// BUG A-ROLE-4: edit/remove only validate OLD role vs actor (isValidRoleEdit) and there is no "index<=1" gate:
// a helper can rewrite their own helper role into admin.
test.failing('BUG A-ROLE-4: helper must NOT be able to edit own helper role into admin', async () => {
  world({ 3: { uni_id: 1, roles: [{ role: 'helper', uni_id: 1, fac_id: 1, major_id: null }] } });
  const res = mkRes();
  await a_editUserRole(req(3, { uid: 3 }, { old: { role: 'helper', uni_id: 1, fac_id: 1, major_id: null }, edit: { role: 'admin', uni_id: 1, fac_id: null, major_id: null } }), res);
  expect(res.code).not.toBe(200);
});

test('delete: actor index must be >= role being removed and same university', async () => {
  world({ 1: { uni_id: 1, roles: [{ role: 'moderator', uni_id: 1 }] }, 2: { uni_id: 1, roles: [{ role: 'admin', uni_id: 1 }] } });
  let res = mkRes();
  await a_deleteUserRole(req(1, { uid: 2 }, { uni_id: 1, fac_id: null, major_id: null, role: 'admin' }), res);
  expect(res.code).toBe(403);
  res = mkRes();
  await a_deleteUserRole(req(1, { uid: 2 }, { uni_id: 1, fac_id: null, major_id: null, role: 'helper' }), res);
  expect(res.code).toBe(200);
});

test('edit without old/edit body -> 500 Internal Server Error (no validation)', async () => {
  world({ 1: { uni_id: 1, roles: [{ role: 'admin', uni_id: null }] } });
  const res = mkRes();
  await a_editUserRole(req(1, { uid: 2 }, {}), res);
  expect(res.code).toBe(500);
});

test('add role for non-existent target uid -> 500 (targetUser null dereferenced)', async () => {
  world({ 1: { uni_id: 1, roles: [{ role: 'admin', uni_id: null }] } });
  const res = mkRes();
  await a_addUserRole(req(1, { uid: 999 }, { uni_id: 1, role: 'moderator' }), res);
  expect(res.code).toBe(500);
});
