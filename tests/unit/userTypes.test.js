import { test, expect } from 'bun:test';
const { userType, getRoleIndex, roleGrantAccess, getLargestRole, isUserHadRole } = require('../../src/routes/users/userTypes');

test('role ladder order is user < helper < moderator < admin', () => {
  expect(userType).toEqual(['user', 'helper', 'moderator', 'admin']);
  expect(getRoleIndex('admin')).toBe(3);
  expect(getRoleIndex('nope')).toBe(-1);
});

test('roleGrantAccess: actor must be >= target role', () => {
  expect(roleGrantAccess('admin', 'moderator')).toBe(true);
  expect(roleGrantAccess('moderator', 'moderator')).toBe(true);
  expect(roleGrantAccess('helper', 'moderator')).toBe(false);
});

test('getLargestRole picks highest role and returns its index', () => {
  const roles = [{ role: 'helper' }, { role: 'admin' }, { role: 'user' }];
  expect(getLargestRole(roles)).toEqual({ role: { role: 'admin' }, index: 3 });
  expect(getLargestRole([{ role: 'user' }])).toEqual({ role: { role: 'user' }, index: 0 });
});

test('isUserHadRole matches role + uni + fac + major; missing major compares undefined === undefined', () => {
  const roles = [{ role: 'helper', university: { uni_id: 1 }, faculty: { fac_id: 2 }, major: { cr_id: 9 } }];
  expect(isUserHadRole({ role: 'helper', uni_id: 1, fac_id: 2, major: 9 }, roles)).toBe(true);
  expect(isUserHadRole({ role: 'admin', uni_id: 1, fac_id: 2, major: 9 }, roles)).toBe(false);
  // role has major:null -> r.major?.cr_id is undefined, so a request w/o "major" matches
  expect(isUserHadRole({ role: 'helper', uni_id: 1, fac_id: 2 }, [{ ...roles[0], major: null }])).toBe(true);
  // NOTE route a_addUserRole passes {major_id} (not {major}) so the major dimension is never compared (BUG A-ROLE-3)
  expect(isUserHadRole({ role: 'helper', uni_id: 1, fac_id: 2, major_id: 5 }, [{ ...roles[0], major: null }])).toBe(true);
});

// BUG A-ROLE-1 (admin-roles book): roleGrantAccess compares ACTOR against the target user's CURRENT role,
// not against the role being granted, and an unknown target role (-1) is always "granted".
test('roleGrantAccess(actor, unknownRole) is true (documents bug: unknown role accepted)', () => {
  expect(roleGrantAccess('user', 'garbage')).toBe(true);
});
test.todo('BUG A-ROLE-1: roleGrantAccess should reject unknown role names');

// BUG A-ROLE-2: a user who has no roles at all -> getLargestRole([]) returns undefined role
test('getLargestRole([]) returns {role: undefined, index: 0} (documents bug: callers crash on role.role)', () => {
  expect(getLargestRole([])).toEqual({ role: undefined, index: 0 });
});
