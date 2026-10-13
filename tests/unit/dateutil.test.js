import { test, expect, setSystemTime, afterAll } from 'bun:test';
const { createDbDate } = require('../../src/utils/dateutil');

afterAll(() => setSystemTime());

test('createDbDate zero-pads month and day', () => {
  setSystemTime(new Date(2026, 0, 5, 12)); // local 2026-01-05
  expect(createDbDate()).toBe('2026-01-05');
});
test('createDbDate does not pad two-digit values', () => {
  setSystemTime(new Date(2026, 10, 25, 12));
  expect(createDbDate()).toBe('2026-11-25');
});
