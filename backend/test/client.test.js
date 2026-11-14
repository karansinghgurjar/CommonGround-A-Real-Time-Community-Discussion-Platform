import test from 'node:test';
import assert from 'node:assert/strict';
let sequence = 0;
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
async function client() {
  const module = await import(`../../frontend/src/apiClient.js?test=${++sequence}`);
  let token = 'expired';
  let logouts = 0;
  module.setTokenGetter(() => token);
  module.setTokenUpdater(value => { token = value; });
  module.setLogoutHandler(() => { logouts++; });
  return { ...module, getToken: () => token, getLogouts: () => logouts };
}
test('frontend API session recovery and upload failure handling', async t => {
  const originalFetch = globalThis.fetch;
  const originalXHR = globalThis.XMLHttpRequest;
  t.after(() => { globalThis.fetch = originalFetch; globalThis.XMLHttpRequest = originalXHR; });
  await t.test('concurrent expired requests share one refresh and retry with the new token', async () => {
    const api = await client();
    let refreshes = 0; let retries = 0;
    globalThis.fetch = async (url, options) => {
      assert.equal(options.credentials, 'include');
      if (url === '/api/auth/refresh') { refreshes++; return json({ accessToken: 'renewed' }); }
      if (options.headers.Authorization === 'Bearer expired') return json({ message: 'expired' }, 401);
      assert.equal(options.headers.Authorization, 'Bearer renewed'); retries++;
      return json({ ok: true });
    };
    const results = await Promise.all([api.default.get('/notifications'), api.default.get('/admin/users')]);
    assert.equal(refreshes, 1); assert.equal(retries, 2); assert.equal(results[0].data.ok, true); assert.equal(api.getToken(), 'renewed');
  });
  await t.test('revoked refresh session clears authentication', async () => {
    const api = await client();
    globalThis.fetch = async () => json({ message: 'expired' }, 401);
    await assert.rejects(api.default.get('/notifications'), /Please sign in/);
    assert.equal(api.getLogouts(), 1);
  });
  await t.test('temporary network failures do not log out an otherwise valid session', async () => {
    const api = await client();
    globalThis.fetch = async url => { if (url.endsWith('/refresh')) throw new TypeError('Network unavailable'); return json({}, 401); };
    await assert.rejects(api.default.get('/notifications'), /Network unavailable/);
    assert.equal(api.getLogouts(), 0);
  });
  await t.test('login failures do not enter a token-refresh loop', async () => {
    const api = await client(); let requests = 0;
    globalThis.fetch = async () => { requests++; return json({ message: 'Incorrect credentials' }, 401); };
    await assert.rejects(api.default.post('/auth/login', {}), /Incorrect credentials/);
    assert.equal(requests, 1);
  });
  await t.test('cancelled history requests pass their abort signal to fetch', async () => {
    const api = await client(); const controller = new AbortController();
    globalThis.fetch = async (url, options) => { assert.equal(options.signal, controller.signal); return json([]); };
    await api.default.get('/notifications', { signal: controller.signal });
  });
  await t.test('upload refreshes credentials, reports progress, and resolves the server response', async () => {
    const api = await client(); globalThis.fetch = async () => json({ accessToken: 'renewed' });
    const percentages = [];
    globalThis.XMLHttpRequest = class {
      upload = {};
      open(method, url) { assert.equal(method, 'POST'); assert.equal(url, '/api/upload'); }
      setRequestHeader(name, value) { assert.equal(name, 'Authorization'); assert.equal(value, 'Bearer renewed'); }
      send(form) {
        assert.equal(this.withCredentials, true); assert.ok(form.get('avatar'));
        this.upload.onprogress({ lengthComputable: true, loaded: 5, total: 10 });
        this.status = 200; this.responseText = '{"url":"/uploads/test.png"}'; this.onload();
      }
    };
    assert.equal((await api.uploadAvatar(new Blob(['test'], { type: 'image/png' }), value => percentages.push(value))).url, '/uploads/test.png');
    assert.deepEqual(percentages, [50]);
  });
  await t.test('upload timeout and invalid server replies reject without hanging', async () => {
    const api = await client(); globalThis.fetch = async () => json({ accessToken: 'renewed' });
    let timeout = true;
    globalThis.XMLHttpRequest = class {
      upload = {};
      open() {}
      setRequestHeader() {}
      send() { if (timeout) this.ontimeout(); else { this.responseText = 'not JSON'; this.onload(); } }
    };
    await assert.rejects(api.uploadAvatar(new Blob(['test']), () => {}), /timed out/);
    timeout = false;
    await assert.rejects(api.uploadAvatar(new Blob(['test']), () => {}), /Invalid server response/);
  });
});
