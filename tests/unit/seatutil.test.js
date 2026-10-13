import { test, expect } from 'bun:test';
const { withSeatNames } = require('../../src/utils/seatutil');

test('adds seat_taken (=seat_remain) and seat_capacity (=seat_available), keeps old keys', () => {
  expect(withSeatNames({ code: 'A', seat_remain: 30, seat_available: 50 })).toEqual({
    code: 'A', seat_remain: 30, seat_available: 50, seat_taken: 30, seat_capacity: 50,
  });
});
test('-1 sentinel is kept; null/undefined (no course_seat row) -> -1', () => {
  expect(withSeatNames({ seat_remain: -1, seat_available: -1 })).toMatchObject({ seat_taken: -1, seat_capacity: -1 });
  expect(withSeatNames({ seat_remain: null, seat_available: null })).toMatchObject({ seat_taken: -1, seat_capacity: -1 });
  expect(withSeatNames({})).toMatchObject({ seat_taken: -1, seat_capacity: -1 });
});
test('0 is a real value, not unknown', () => {
  expect(withSeatNames({ seat_remain: 0, seat_available: 0 })).toMatchObject({ seat_taken: 0, seat_capacity: 0 });
});
test('a cache entry written before the change (old keys only) gets the new keys; idempotent', () => {
  const old = JSON.parse(JSON.stringify({ code: 'A', sec: 1, seat_remain: 5, seat_available: 40 }));
  const once = withSeatNames(old);
  expect(once).toMatchObject({ seat_taken: 5, seat_capacity: 40 });
  expect(withSeatNames(once)).toEqual(once);
});
