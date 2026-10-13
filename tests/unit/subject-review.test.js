// Unit tests for src/routes/subject/index.js — subject detail + student reviews.
// Book: .feature-books/features/feat-subject-review.md
import { test, expect, mock, beforeEach } from 'bun:test';
process.env.SECRET_JWT = 'test-secret-placeholder';
globalThis.__db ??= { handler: async () => ({ rows: [], rowCount: 0 }), calls: [] };
mock.module('../../src/db', () => ({ query: async (t, p) => { __db.calls.push([t, p]); return __db.handler(t, p); } }));
globalThis.__redis ??= { store: new Map(), ops: [] };
class FakeRedis {
  async get(k) { __redis.ops.push(['get', k]); return __redis.store.get(k) ?? null; }
  async mget(...ks) { return ks.map((k) => __redis.store.get(k) ?? null); }
  async set(k, v, ...a) { __redis.ops.push(['set', k, v, ...a]); __redis.store.set(k, v); return 'OK'; }
  async del(k) { __redis.store.delete(k); }
  pipeline() { const q = []; const p = { set: (...a) => { q.push(a); return p; }, exec: async () => { for (const a of q) await this.set(...a); return []; } }; return p; }
  on() { return this; }
}
// register once per process: re-registering an already-mocked CJS module breaks the default-export interop
if (!globalThis.__ioredisMocked) { globalThis.__ioredisMocked = true; mock.module('ioredis', () => ({ __esModule: true, default: FakeRedis, Redis: FakeRedis })); }
const jwt = require('jwt-simple');
const S = require('../../src/routes/subject');

const rs = (rows) => ({ rows, rowCount: rows.length });
function useDb(rules = []) {
  __db.handler = async (sql, p) => {
    if (/FROM user_detail WHERE uid/.test(sql)) return rs(p[0] === 7 || p[0] === 8 ? [{ uid: p[0], uni_id: 1 }] : []);
    if (/COUNT\(\*\)/.test(sql)) return rs([{ count: 0 }]);
    if (/user_additionrole/.test(sql)) return rs([]);
    for (const [re, v] of rules) if (re.test(sql)) return rs(typeof v === 'function' ? v(sql, p) : v);
    return rs([]);
  };
}
const mkRes = () => { const r = { code: 200, body: undefined, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, send(b) { r.body = b; return r; } }; return r; };
const rq = (uid, body = {}, query = {}) => ({ headers: uid == null ? {} : { authorization: jwt.encode({ uid }, process.env.SECRET_JWT) }, params: { uni_id: 1, suj_id: '0041001' }, body, query });
const sqlCalls = (re) => __db.calls.filter((c) => re.test(c[0]));
const OK = { content: 'ดีมาก', rate: 5, term: '1/2567', sec: 2, anonymous: true, images: ['https://i/x.png'] };
beforeEach(() => { __db.calls = []; __redis.store = new Map(); __redis.ops = []; useDb([[/INSERT INTO subject_review/, [{ review_id: 55 }]]]); });

const add = async (body, uid = 7) => { const res = mkRes(); await S.a_addSubjectReview(rq(uid, body), res); return res; };

test('valid review -> 201 with review_id; term "1/2567" is stored as std_semester=1, std_year=2567; images JSON-encoded', async () => {
  const res = await add(OK);
  expect(res.code).toBe(201);
  expect(res.body.review_id).toBe(55);
  const p = sqlCalls(/INSERT INTO subject_review/)[0][1];
  expect(p).toEqual([7, 1, '0041001', 'ดีมาก', '["https://i/x.png"]', '1', '2567', 5, 2, true]);
});
test.each([
  ['missing content', { ...OK, content: '' }, 'กรุณากรอกเนื้อหารีวิว'],
  ['content > 1000 chars', { ...OK, content: 'ก'.repeat(1001) }, 'เนื้อหารีวิวต้องไม่เกิน 1000 ตัวอักษร'],
  ['HTML-only content', { ...OK, content: '<p> </p>' }, 'กรุณากรอกเนื้อหารีวิว'],
  ['rate 6', { ...OK, rate: 6 }, 'คะแนนต้องอยู่ระหว่าง 0-5'],
  ['rate 4.5', { ...OK, rate: 4.5 }, 'คะแนนต้องอยู่ระหว่าง 0-5'],
  ['rate as string', { ...OK, rate: '5' }, 'คะแนนต้องอยู่ระหว่าง 0-5'],
  ['term 2567/1', { ...OK, term: '2567/1' }, 'รูปแบบเทอมไม่ถูกต้อง (เช่น 1/2567)'],
  ['sec 0', { ...OK, sec: 0 }, 'กลุ่มเรียนต้องเป็นตัวเลขที่มากกว่า 0'],
  ['images not strings', { ...OK, images: [1] }, 'รูปภาพต้องเป็น array ของ URL'],
])('validation: %s -> 400', async (_n, body, msg) => {
  const res = await add(body);
  expect(res.code).toBe(400);
  expect(res.body).toEqual({ success: false, message: msg });
  expect(sqlCalls(/INSERT/)).toHaveLength(0);
});
test('rate 0 is accepted (validator allows 0-5 although the code comment says 1-5); term and sec are optional', async () => {
  expect((await add({ content: 'x', rate: 0 })).code).toBe(201);
  const p = sqlCalls(/INSERT INTO subject_review/)[0][1];
  expect(p.slice(5, 7)).toEqual([null, null]);
});
test('no one-review-per-user rule: the same user can POST twice -> two INSERTs (subject_review has no unique key on uid+subject)', async () => {
  await add(OK); await add(OK);
  expect(sqlCalls(/INSERT INTO subject_review/)).toHaveLength(2);
});
test('BUG-REV-1 (current behavior): anonymous POST (no token, route has no requireJWTAuth) -> 500 "เพิ่มรีวิวไม่ได้"', async () => {
  const res = await add(OK, null);
  expect(res.code).toBe(500);
});
test.todo('BUG-REV-1: anonymous review POST must be 401', async () => {
  expect((await add(OK, null)).code).toBe(401);
});
test('edit/delete are scoped to the caller (WHERE uid = caller AND uni_id AND suj_real_code) and 404 when none', async () => {
  useDb([[/UPDATE subject_review/, []], [/DELETE FROM subject_review/, []]]);
  let res = mkRes(); await S.a_editSubjectReview(rq(8, OK), res);
  expect(res.code).toBe(404);
  expect(sqlCalls(/UPDATE subject_review/)[0][1].slice(7)).toEqual([8, 1, '0041001']);
  res = mkRes(); await S.a_deleteSubjectReview(rq(8), res);
  expect(res.code).toBe(404);
  expect(sqlCalls(/DELETE FROM subject_review/)[0][1]).toEqual([8, 1, '0041001']);
});

// ---------- GET /university/:uni_id/subject/:suj_id (index.js:163) ----------
const detailRules = (reviews, seasons = PAST_AND_FUTURE) => [
  [/FROM university_detail/, [{ uni_key: 'msu' }]],
  [/FROM subject_review LEFT JOIN/, reviews],
  [/SELECT code, year, semester, sec FROM course_detail/, [{ code: '0041001', year: 2567, semester: 1, sec: 2 }, { code: '0041001', year: 2567, semester: 1, sec: 3 }, { code: '0041001', year: 2599, semester: 1, sec: 1 }]],
  [/FROM courseset_subject WHERE uni_id = \$1 AND suj_real_id/, [{ suj_real_id: '0041001', uni_id: 1, fac_id: 0, cr_id: 5, suj_pre_req: null }]],
  [/FROM\s+seamster_detail/, seasons],
];
// getCurrentSeason (seasonutil.js:50) returns the season BEFORE the first window that has not ended yet
const PAST_AND_FUTURE = [
  { year: 2567, seamster_round: 1, ss_round: 1, std_year: 1, ss_start: '2000-01-01', ss_end: '2000-01-02' },
  { year: 2599, seamster_round: 1, ss_round: 1, std_year: 1, ss_start: '2999-01-01', ss_end: '2999-01-02' },
];
test('anonymous reviews hide author identity; own review is returned separately as review_owned with identity', async () => {
  useDb(detailRules([
    { review_id: 1, uid: 7, anonymous: true, username: 'me', std_name: 'Me', std_semester: 1, std_year: 2567, sec: 2 },
    { review_id: 2, uid: 8, anonymous: false, username: 'pub', std_name: 'Pub', std_semester: 1, std_year: 2567, sec: 3 },
  ]));
  const res = mkRes(); await S.getSubjectDetail(rq(7), res);
  const [a, b] = res.body.reviews;
  expect(a.user).toEqual({ anonymous: true, uid: null, username: null, name: null, image: null });
  expect(b.user).toMatchObject({ anonymous: false, uid: 8, username: 'pub', name: 'Pub' });
  expect(a.sec_detail).toEqual({ code: '0041001', year: 2567, semester: 1, sec: 2 });
  expect(res.body.review_owned.user).toMatchObject({ uid: 7, username: 'me' });
});
test('subject detail: sum_terms lists only terms up to the current season; subject part cached 1h, reviews always live', async () => {
  useDb(detailRules([]));
  const res = mkRes(); await S.getSubjectDetail(rq(null, {}, { year: 2567, semester: 1 }), res);
  expect(res.body.cached).toBe(false);
  expect(res.body.subject.sum_terms.map((t) => t.term)).toEqual(['1/2567']);
  expect(res.body.subject.sum_terms[0].secs).toEqual([{ sec: 2 }, { sec: 3 }]);
  const set = __redis.ops.find((o) => o[0] === 'set');
  expect(set[1]).toBe('planriean-msu:subject:0041001:2567-1:pdpa-v1');
  expect(set.slice(3)).toEqual(['EX', 3600]);
  __db.calls = [];
  const res2 = mkRes(); await S.getSubjectDetail(rq(null, {}, { year: 2567, semester: 1 }), res2);
  expect(res2.body.cached).toBe(true);
  expect(sqlCalls(/FROM subject_review LEFT JOIN/)).toHaveLength(1);
});
test('unknown subject -> 200 {success:false, message:"ไม่พบข้อมูลวิชา โปรดติดต่อทีมงาน"} (not 404)', async () => {
  useDb([[/FROM university_detail/, [{ uni_key: 'msu' }]]]);
  const res = mkRes(); await S.getSubjectDetail(rq(null), res);
  expect(res.code).toBe(200);
  expect(res.body).toEqual({ success: false, message: 'ไม่พบข้อมูลวิชา โปรดติดต่อทีมงาน' });
});
test('BUG-SUBJ-2 (current behavior): when every registration window has already ended, getCurrentSeason returns null and subject detail rejects (Express answers 500)', async () => {
  useDb(detailRules([], [PAST_AND_FUTURE[0]]));
  await expect(S.getSubjectDetail(rq(null), mkRes())).rejects.toThrow();
});
test.todo('BUG-SUBJ-2: subject detail must still render when no future registration window is configured', async () => {
  useDb(detailRules([], [PAST_AND_FUTURE[0]]));
  const res = mkRes(); await S.getSubjectDetail(rq(null), res);
  expect(res.body.success).toBe(true);
});
