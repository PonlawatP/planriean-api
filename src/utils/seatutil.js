// DB semantics (authoritative): course_seat.seat_remain = seats already TAKEN,
// course_seat.seat_available = total CAPACITY. The legacy names are misleading and
// kept unchanged for old clients; seat_taken/seat_capacity are the clear aliases.
// -1 = unknown (null/undefined). Idempotent, so entries cached before the alias existed also work.
const orUnknown = (v) => (v === null || v === undefined ? -1 : v);

function withSeatNames(row) {
  return { ...row, seat_taken: orUnknown(row.seat_remain), seat_capacity: orUnknown(row.seat_available) };
}

module.exports = { withSeatNames };
