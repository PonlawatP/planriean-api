// src/elysia-server.js cannot be imported in a unit test: it calls .listen(ELYSIA_PORT) and starts the mail
// token scheduler at module load, and its handlers are not exported. These tests instead reproduce, with the
// installed elysia version, the handler SIGNATURE used at elysia-server.js:89 and :367
//   async function handler(context, parameter = null, data = null) { ... context.body ... }
// Book: .feature-books/features/feat-course.md (BUG-COURSE-1)
import { test, expect } from 'bun:test';
const { Elysia } = require('elysia');

async function sameSignatureAsElysiaServer(context, parameter = null, data = null) { return { body: context.body ?? null }; }
// the fixed shape now used by elysia-server.js (elysiaGetCoursesSpecific / elysiaGetPlanSubjectSeats)
async function fixedSignature(context) { const parameter = null, data = null; return { body: (data || context.body) ?? null }; }
async function singleParam(context) { return { body: context.body ?? null }; }
async function destructured({ body }) { return { body: body ?? null }; }

const app = new Elysia()
  .post('/server-signature', sameSignatureAsElysiaServer)
  .post('/single-param', singleParam)
  .post('/fixed', fixedSignature)
  .post('/destructured', destructured);
// app.handle() (no port, no global fetch — another test file stubs globalThis.fetch)
const post = async (path) => (await app.handle(new Request(`http://localhost${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subjects: [{ code: '0041001', sec: 1 }] }),
}))).json();

test('BUG-COURSE-1 (current behavior): with the (context, parameter = null, data = null) signature Elysia never parses the JSON body', async () => {
  // consequence in elysia-server.js: /seats always answers {seats: []} and course search throws on searchData.type -> 500
  expect((await post('/server-signature')).body).toBeNull();
});
test('control: a single-param or destructured handler receives the parsed body', async () => {
  expect((await post('/single-param')).body).toEqual({ subjects: [{ code: '0041001', sec: 1 }] });
  expect((await post('/destructured')).body).toEqual({ subjects: [{ code: '0041001', sec: 1 }] });
});
test('H8: the fixed handler shape used by elysia-server.js receives the parsed body', async () => {
  expect((await post('/fixed')).body).toEqual({ subjects: [{ code: '0041001', sec: 1 }] });
});
