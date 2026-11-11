import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverPasswordReset, passwordEmailConfigured } from './password-reset.mjs';

const env = { NODE_ENV: 'production', APP_URL: 'https://thesongshowdown.com', RESEND_API_KEY: 'test-private-key', EMAIL_FROM: 'Song Showdown <noreply@mail.thesongshowdown.com>' };
const delivery = { email: 'member@example.com', token: 'a'.repeat(43) };

test('Resend receives authenticated email with configured sender and single-use public link', async () => {
  let calls = 0;
  await deliverPasswordReset(delivery, { env: { ...env, PASSWORD_RESET_EMAIL_WEBHOOK: 'https://unused.example' }, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer test-private-key');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.ok(options.signal instanceof AbortSignal);
    const body = JSON.parse(options.body);
    assert.equal(body.from, env.EMAIL_FROM);
    assert.deepEqual(body.to, [delivery.email]);
    assert.match(body.subject, /Set or reset/);
    assert.ok(body.text.includes(`https://thesongshowdown.com/#resetToken=${delivery.token}`));
    assert.match(body.text, /30 minutes/);
    return { ok: true };
  } });
  assert.equal(calls, 1);
});

test('production configuration requires complete provider and HTTPS public URL', async () => {
  assert.equal(passwordEmailConfigured(env), true);
  for (const invalid of [ { ...env, EMAIL_FROM: '' }, { ...env, APP_URL: '' }, { ...env, APP_URL: 'bad' }, { ...env, APP_URL: 'http://localhost:4200' }, { ...env, RESEND_API_KEY: '' } ]) {
    assert.equal(passwordEmailConfigured(invalid), false);
    await assert.rejects(deliverPasswordReset(delivery, { env: invalid, fetchImpl: () => assert.fail('must not send') }), /not configured/);
  }
});

test('legacy webhook still receives its original payload and bearer credential', async () => {
  const legacy = { NODE_ENV: 'production', APP_URL: env.APP_URL, PASSWORD_RESET_EMAIL_WEBHOOK: 'https://adapter.example/send', PASSWORD_RESET_EMAIL_SECRET: 'adapter-key' };
  assert.equal(passwordEmailConfigured(legacy), true);
  await deliverPasswordReset(delivery, { env: legacy, fetchImpl: async (url, options) => {
    assert.equal(url, legacy.PASSWORD_RESET_EMAIL_WEBHOOK);
    assert.equal(options.headers.Authorization, 'Bearer adapter-key');
    const body = JSON.parse(options.body);
    assert.equal(body.to, delivery.email);
    assert.equal(body.from, undefined);
    return { ok: true };
  } });
});

test('rejections and network failures produce generic errors without secrets', async () => {
  for (const fetchImpl of [async () => ({ ok: false, status: 403 }), async () => { throw new Error(`secret ${env.RESEND_API_KEY} ${delivery.token}`); }]) {
    await assert.rejects(deliverPasswordReset(delivery, { env, fetchImpl }), { message: 'Password reset email delivery failed.' });
  }
});
