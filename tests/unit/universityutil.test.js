import { test, expect, mock } from 'bun:test';
globalThis.__db ??= { handler: async () => ({ rows: [], rowCount: 0 }), calls: [] };
mock.module('../../src/db', () => ({ query: async (t, p) => { __db.calls.push([t, p]); return __db.handler(t, p); } }));
const { getFacIdFromFacNameTh } = require('../../src/utils/universityutil');

test('returns fac_id when found and queries case-insensitively', async () => {
  __db.handler = async () => ({ rows: [{ fac_id: 5 }], rowCount: 1 });
  expect(await getFacIdFromFacNameTh(1, 'คณะวิทยาศาสตร์')).toBe(5);
  const [sql, params] = __db.calls.at(-1);
  expect(sql).toContain('LOWER(fac_name_th) = LOWER($2)');
  expect(params).toEqual([1, 'คณะวิทยาศาสตร์']);
});
test('returns null when not found', async () => {
  __db.handler = async () => ({ rows: [], rowCount: 0 });
  expect(await getFacIdFromFacNameTh(1, 'x')).toBeNull();
});
test('rethrows db errors', async () => {
  __db.handler = async () => { throw new Error('db down'); };
  await expect(getFacIdFromFacNameTh(1, 'x')).rejects.toThrow('db down');
});
