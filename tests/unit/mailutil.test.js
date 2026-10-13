import { test, expect } from 'bun:test';
process.env.RESEND_API_KEY = 'placeholder-key';
// The resend SDK posts via global fetch: stub it so no network call is ever made.
globalThis.__resendSent = [];
globalThis.fetch = async (url, init) => {
  __resendSent.push({ url: String(url), ...JSON.parse(init.body) });
  return new Response(JSON.stringify({ id: 'x' }), { status: 200, headers: { 'content-type': 'application/json' } });
};
const { sendResendEmail } = require('../../src/utils/mailutil');

test('sendResendEmail forwards message and returns {data,error}', async () => {
  const r = await sendResendEmail({ from: 'a@x.test', to: 'b@x.test', subject: 's', html: '<p>h</p>' });
  expect(r.error).toBeNull();
  expect(r.data).toEqual({ id: 'x' });
  expect(__resendSent.at(-1)).toMatchObject({ from: 'a@x.test', to: 'b@x.test', subject: 's' });
});

test('sendResendEmail falls back to RESEND_FROM_EMAIL, then USER_EMAIL', async () => {
  process.env.RESEND_FROM_EMAIL = 'from-env@x.test';
  await sendResendEmail({ to: 'b@x.test', subject: 's', html: 'h' });
  expect(__resendSent.at(-1).from).toBe('from-env@x.test');
  delete process.env.RESEND_FROM_EMAIL;
  process.env.USER_EMAIL = 'user-env@x.test';
  await sendResendEmail({ to: 'b@x.test', subject: 's', html: 'h' });
  expect(__resendSent.at(-1).from).toBe('user-env@x.test');
});

test('sendResendEmail throws when no sender is configured and no from given', async () => {
  delete process.env.RESEND_FROM_EMAIL; delete process.env.USER_EMAIL;
  await expect(sendResendEmail({ to: 'b@x.test', subject: 's', html: 'h' })).rejects.toThrow(/RESEND_FROM_EMAIL or USER_EMAIL/);
});
