// Unit tests for src/routes/course/index.js (Express course search, also used by the Elysia WS "get_course_list").
// No DB / Redis: db is mocked via __db, ioredis via FakeRedis (same convention as the other tests/unit files).
// Book: .feature-books/features/feat-course.md
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

const COURSE_PATH = require.resolve('../../src/routes/course');
// course/index.js keeps a module-level 10-minute cache (courseCache) -> load a fresh copy per test
const freshCourse = () => { delete require.cache[COURSE_PATH]; return require(COURSE_PATH); };

const UPDATED = '13/10/69 02:00:15';
const row = (o) => ({ uni_id: 1, year: 2569, semester: 1, code: '0041001', name_en: 'Eng', note: '', credit: '3(3-0-6)', time: 'Mo13:00-16:00 IT-201', sec: 1, exam_mid: null, exam_final: null, cr_id: 1, suj_real_code: '0041001', ...o });

// db fake: course_detail rows for (year, semester), seat rows filtered by SIMILAR TO pattern (simplified to prefix match)
function useCatalog(byTerm) {
  __db.handler = async (sql, p) => {
    if (sql.includes('FROM university_detail')) return { rows: [{ uni_key: 'msu', formatted_date: UPDATED }], rowCount: 1 };
    if (sql.includes('LEFT JOIN course_seat')) {
      const [, y, s, pattern] = p;
      const alts = pattern.split('|').map((a) => a.replaceAll('%', ''));
      const rows = (byTerm[`${y}/${s}`] || []).filter((r) => alts.some((a) => r.code.startsWith(a)))
        .map((r) => ({ suj_real_code: r.suj_real_code, sec: r.sec, seat_remain: 5, seat_available: 40 }));
      return { rows, rowCount: rows.length };
    }
    if (sql.includes('course_detail.uni_id,')) { // getCoursesData (course/index.js:58)
      const rows = byTerm[`${p[1]}/${p[2]}`] || []; return { rows, rowCount: rows.length };
    }
    if (sql.includes('FROM courseset_subject')) return { rows: [{ suj_real_id: '0041001', suj_name_th: 'ภาษาอังกฤษ' }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
}
const body = (o = {}) => ({ type: [], code: [], date: [], time: 'total', ...o });
const search = (C, params, data) => C.getCoursesSpecific(null, null, { uni_id: 1, ...params }, data);
const seatQuery = () => __db.calls.find((c) => c[0].includes('LEFT JOIN course_seat'));

beforeEach(() => { __db.calls = []; __redis.store = new Map(); __redis.ops = []; });

test('empty type[] defaults to GE prefix "004*" and is sent to SQL as SIMILAR TO "004%"', async () => {
  useCatalog({ '2569/1': [row()] });
  const C = freshCourse();
  const r = await search(C, { year: 2569, semester: 1 }, body());
  expect(seatQuery()[1]).toEqual([1, 2569, 1, '004%']);
  expect(r.cached).toBe(false);
  expect(r.updated).toBe(UPDATED);
  expect(r.subjects).toHaveLength(1);
  expect(r.subjects[0]).toMatchObject({ code: '0041001', name_th: 'ภาษาอังกฤษ', seat_remain: 5, seat_available: 40 });
});

test('explicit code[] wins over type[] and is OR-joined with "|"', async () => {
  useCatalog({ '2569/1': [row()] });
  await search(freshCourse(), { year: 2569, semester: 1 }, body({ type: ['0041*', '0042*'], code: ['0041001', '1204101'] }));
  expect(seatQuery()[1][3]).toBe('0041001|1204101');
});

test('result is cached in Redis for 30s under a key built from every filter; a second identical call is served from cache', async () => {
  useCatalog({ '2569/1': [row()] });
  const C = freshCourse();
  await search(C, { year: 2569, semester: 1 }, body({ type: ['0041*'], date: ['Mo'], time: '8-12' }));
  const set = __redis.ops.find((o) => o[0] === 'set' && o[1].includes(':subjs:2569-1'));
  expect(set[1]).toBe('planriean-msu:subjs:2569-1:0041*--Mo-8-12:pdpa-v1');
  expect(set.slice(3)).toEqual(['EX', 30]);
  expect(__redis.store.get('planriean-msu:subjs:dataUpdated')).toBe(UPDATED);
  __db.calls = [];
  const r2 = await search(C, { year: 2569, semester: 1 }, body({ type: ['0041*'], date: ['Mo'], time: '8-12' }));
  expect(r2.cached).toBe(true);
  expect(seatQuery()).toBeUndefined();
});

test('cache is ignored once university_detail.refresh_updated_at changes (scraper refresh invalidates)', async () => {
  useCatalog({ '2569/1': [row()] });
  const C = freshCourse();
  await search(C, { year: 2569, semester: 1 }, body());
  __redis.store.set('planriean-msu:subjs:dataUpdated', 'older');
  const r = await search(C, { year: 2569, semester: 1 }, body());
  expect(r.cached).toBe(false);
});

test('time range filter "13-16" keeps a section only if a meeting starts >=13h and ends <=16h (hours only)', async () => {
  useCatalog({ '2569/1': [
    row({ sec: 1, time: 'Mo13:00-16:00 IT-201' }),
    row({ sec: 2, time: 'Mo13:00-17:00 IT-201' }),
    row({ sec: 3, time: 'Mo13:00-16:30 IT-201' }), // minutes ignored -> kept
  ] });
  const r = await search(freshCourse(), { year: 2569, semester: 1 }, body({ time: '13-16' }));
  expect(r.subjects.map((s) => s.sec).sort()).toEqual([1, 3]);
});

test('single-hour time filter "13" keeps sections with any meeting starting at or after 13h', async () => {
  useCatalog({ '2569/1': [row({ sec: 1, time: 'Mo09:00-12:00 A' }), row({ sec: 2, time: 'Mo09:00-12:00 A;We13:00-15:00 A' })] });
  const r = await search(freshCourse(), { year: 2569, semester: 1 }, body({ time: '13' }));
  expect(r.subjects.map((s) => s.sec)).toEqual([2]);
});

test('day filter matches the FIRST meeting day of a section', async () => {
  useCatalog({ '2569/1': [row({ sec: 1, time: 'Mo09:00-12:00 A' }), row({ sec: 2, time: 'Tu09:00-12:00 A' })] });
  const r = await search(freshCourse(), { year: 2569, semester: 1 }, body({ date: ['Mo'] }));
  expect(r.subjects.map((s) => s.sec)).toEqual([1]);
});

// BUG-COURSE-3 (course/index.js:249, elysia-server.js:289): only time.substring(0,2) is compared,
// so a section meeting Mo + We is invisible when filtering by We.
test.todo('BUG-COURSE-3: day filter should match ANY meeting day of a multi-day section', async () => {
  useCatalog({ '2569/1': [row({ sec: 1, time: 'Mo09:00-12:00 A;We13:00-15:00 A' })] });
  const r = await search(freshCourse(), { year: 2569, semester: 1 }, body({ date: ['We'] }));
  expect(r.subjects.map((s) => s.sec)).toEqual([1]);
});

test('BUG-COURSE-2 (current behavior): module-level courseCache ignores (uni_id, year, semester) for 10 min', async () => {
  useCatalog({ '2569/1': [row({ year: 2569, semester: 1 })], '2569/2': [row({ year: 2569, semester: 2 })] });
  const C = freshCourse();
  await search(C, { year: 2569, semester: 1 }, body());
  const r = await search(C, { year: 2569, semester: 2 }, body());
  // the semester-2 request is answered with semester-1 rows (course/index.js:53-55)
  expect(r.subjects[0].semester).toBe(1);
});

test.todo('BUG-COURSE-2: a semester-2 search after a semester-1 search must return semester-2 rows', async () => {
  useCatalog({ '2569/1': [row({ year: 2569, semester: 1 })], '2569/2': [row({ year: 2569, semester: 2 })] });
  const C = freshCourse();
  await search(C, { year: 2569, semester: 1 }, body());
  const r = await search(C, { year: 2569, semester: 2 }, body());
  expect(r.subjects[0].semester).toBe(2);
});

test('BUG-COURSE-4 (schema drift, current behavior): Express SELECT asks for exam_*_override columns that the local schema lacks', async () => {
  useCatalog({ '2569/1': [row()] });
  await search(freshCourse(), { year: 2569, semester: 1 }, body());
  const q = __db.calls.find((c) => c[0].includes('course_detail.exam_mid_override'));
  expect(q).toBeDefined(); // live DB answers: column course_detail.exam_mid_override does not exist -> 500
});

test('request without body.type throws -> HTTP 500 "Internal Server Error" (no 400 validation)', async () => {
  useCatalog({});
  const res = { code: 200, status(c) { this.code = c; return this; }, send(b) { this.body = b; return this; }, json(b) { this.body = b; return this; } };
  await freshCourse().getCoursesSpecific({ params: { uni_id: 1, year: 2569, semester: 1 }, body: {} }, res);
  expect(res.code).toBe(500);
  expect(res.body).toBe('Internal Server Error');
});

test('deprecated /course/:year/:semester has no uni_id param -> defaults to uni_id 1', async () => {
  useCatalog({ '2569/1': [row()] });
  const res = { status() { return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; } };
  await freshCourse().getCoursesSpecific({ params: { year: 2569, semester: 1 }, body: body() }, res);
  expect(seatQuery()[1][0]).toBe(1);
});
