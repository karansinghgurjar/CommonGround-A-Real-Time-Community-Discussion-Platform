import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { once } from 'node:events';
const require = createRequire(import.meta.url);
const { io } = require('../node_modules/socket.io/client-dist/socket.io.js');
const jwt = require('jsonwebtoken');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('community workflows with isolated storage', { timeout: 120000 }, async t => {
  const storage = await mkdtemp(path.join(tmpdir(), 'commonground-test-'));
  const port = 3300 + Math.floor(Math.random() * 1000);
  const base = `http://127.0.0.1:${port}`;
  let child;
  let log = '';
  const sockets = [];
  const streams = [];
  const streamBuffers = new WeakMap();
  async function streamEvent(reader, predicate) {
    let buffer = streamBuffers.get(reader) || '';
    while (true) {
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
        const line = frame.split('\n').find(line => line.startsWith('data: '));
        if (line) {
          const data = JSON.parse(line.slice(6));
          if (predicate(data)) { streamBuffers.set(reader, buffer); return data; }
        }
      }
      const { value, done } = await reader.read();
      if (done) throw new Error('Notification stream ended unexpectedly');
      buffer += new TextDecoder().decode(value);
    }
  }
  async function start() {
    child = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port), DATA_DIR: storage, JWT_SECRET: 'isolated-integration-test-secret', CLIENT_URL: 'http://localhost:5173', NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', chunk => { log += chunk; });
    child.stderr.on('data', chunk => { log += chunk; });
    for (let attempt = 0; attempt < 600; attempt++) {
      try { const response = await fetch(`${base}/api/health`); if (response.ok) return; } catch { /* Wait for listener. */ }
      if (child.exitCode !== null) throw new Error(log);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Server did not start: ${log}`);
  }
  async function stop() { if (child && child.exitCode === null) { const stopped = once(child, 'exit'); child.kill(); await stopped; } }
  t.after(async () => { sockets.forEach(socket => socket.disconnect()); streams.forEach(controller => controller.abort()); await stop(); await rm(storage, { recursive: true, force: true }); });
  async function api(method, route, body, session, cookie) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (session) headers.Authorization = `Bearer ${session.accessToken}`;
    if (cookie) headers.Cookie = cookie;
    const response = await fetch(`${base}/api${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  async function register(name, email) {
    const result = await api('POST', '/auth/register', { name, email, password: 'testing-password-123' });
    assert.equal(result.status, 201);
    return { ...result.data, cookie: result.cookie };
  }
  await start();
  let admin, member, outsider, thread;
  await t.test('registration, roles, duplicate accounts, input validation', async () => {
    admin = await register('Admin User', 'admin@example.test');
    member = await register('Member User', 'member@example.test');
    outsider = await register('Third User', 'third@example.test');
    assert.equal(admin.user.role, 'admin'); assert.equal(member.user.role, 'member');
    assert.equal((await api('POST', '/auth/register', { name: 'Duplicate', email: 'ADMIN@example.test', password: 'testing-password-123' })).status, 409);
    assert.equal((await api('POST', '/auth/register', { name: 'A', email: 'bad', password: 'x' })).status, 400);
    assert.equal((await api('POST', '/auth/login', { email: 'member@example.test', password: 'wrong' })).status, 401);
    const result = await api('POST', '/auth/login', { email: 'member@example.test', password: 'testing-password-123' });
    assert.equal(result.status, 200); assert.ok(result.data.accessToken);
  });
  await t.test('session restoration and protected/admin endpoints', async () => {
    const restored = await api('POST', '/auth/refresh', undefined, undefined, admin.cookie);
    assert.equal(restored.status, 200); assert.equal(restored.data.user.id, admin.user.id);
    assert.equal((await api('GET', '/auth/me')).status, 401);
    assert.equal((await api('GET', '/admin/users', undefined, member)).status, 403);
    const users = await api('GET', '/admin/users', undefined, admin);
    assert.equal(users.status, 200); assert.equal(users.data.length, 3); assert.equal(users.data[0].passwordHash, undefined);
  });
  await t.test('thread creation, listing, search, detail and validation', async () => {
    assert.equal((await api('POST', '/threads', { title: 'No account', content: 'No' })).status, 401);
    assert.equal((await api('POST', '/threads', { title: ' ', content: 'text' }, admin)).status, 400);
    const result = await api('POST', '/threads', { title: 'React discussion', content: 'Let’s discuss hooks.' }, admin);
    assert.equal(result.status, 201); thread = result.data;
    assert.equal((await api('GET', '/threads?search=react')).data.length, 1);
    assert.equal((await api('GET', '/threads?search=nomatch')).data.length, 0);
    assert.equal((await api('GET', `/threads/${thread.id}`)).data.author, 'Admin User');
    assert.equal((await api('GET', '/threads/missing')).status, 404);
  });
  await t.test('empty request bodies and malformed JSON fail cleanly', async () => {
    assert.equal((await api('POST', '/auth/register')).status, 400);
    assert.equal((await api('POST', '/auth/login')).status, 400);
    assert.equal((await api('POST', '/threads', undefined, admin)).status, 400);
    assert.equal((await api('POST', `/threads/${thread.id}/replies`, undefined, admin)).status, 400);
    assert.equal((await api('PATCH', '/profile', undefined, admin)).status, 400);
    const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad json' });
    assert.equal(response.status, 400);
    assert.equal((await api('GET', '/unknown')).status, 404);
  });
  await t.test('oversized JSON and disallowed origins are rejected', async () => {
    assert.equal((await api('POST', '/threads', { title: 'Too big', content: 'x'.repeat(150000) }, admin)).status, 413);
    const response = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { Origin: 'https://untrusted.example' } });
    assert.equal(response.status, 403);
  });
  await t.test('expired and forged access tokens reject while refresh restores access', async () => {
    const payload = jwt.decode(admin.accessToken); delete payload.exp; delete payload.iat;
    const expired = jwt.sign(payload, 'isolated-integration-test-secret', { expiresIn: -1 });
    assert.equal((await api('GET', '/auth/me', undefined, { accessToken: expired })).status, 401);
    assert.equal((await api('GET', '/auth/me', undefined, { accessToken: jwt.sign(payload, 'wrong-key') })).status, 401);
    const refreshed = await api('POST', '/auth/refresh', undefined, undefined, admin.cookie);
    assert.equal((await api('GET', '/auth/me', undefined, refreshed.data)).status, 200);
  });
  await t.test('SSE delivers replies live to multiple tabs and history persists', async () => {
    const readers = [];
    for (let tab = 0; tab < 2; tab++) {
      const controller = new AbortController(); streams.push(controller);
      const response = await fetch(`${base}/api/notifications/stream`, { headers: { Authorization: `Bearer ${admin.accessToken}` }, signal: controller.signal });
      assert.equal(response.status, 200);
      const reader = response.body.getReader(); await streamEvent(reader, data => data.type === 'sync'); readers.push(reader);
    }
    const result = await api('POST', `/threads/${thread.id}/replies`, { content: 'Helpful reply.' }, member);
    assert.equal(result.status, 201);
    for (const reader of readers) {
      const event = await Promise.race([streamEvent(reader, data => !!data.id), new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('SSE event timed out')), 4000); timer.unref(); })]);
      assert.match(event.message, /Member User replied/);
    }
    streams.forEach(controller => controller.abort());
    assert.equal((await api('GET', `/threads/${thread.id}`)).data.replies.length, 1);
    assert.equal((await api('GET', '/notifications', undefined, admin)).data.length, 1);
    assert.equal((await api('GET', '/notifications', undefined, outsider)).data.length, 0);
  });
  await t.test('notification read authorization and mark-all', async () => {
    const notification = (await api('GET', '/notifications', undefined, admin)).data[0];
    assert.equal((await api('POST', `/notifications/${notification.id}/read`, undefined, outsider)).status, 404);
    assert.equal((await api('POST', `/notifications/${notification.id}/read`, undefined, admin)).data.isRead, true);
    assert.equal((await api('POST', '/notifications/read-all', undefined, admin)).status, 200);
  });
  await t.test('notification read state syncs live to other tabs', async () => {
    const controller = new AbortController(); streams.push(controller);
    const response = await fetch(`${base}/api/notifications/stream`, { headers: { Authorization: `Bearer ${admin.accessToken}` }, signal: controller.signal });
    const reader = response.body.getReader();
    await streamEvent(reader, data => data.type === 'sync');
    const synced = streamEvent(reader, data => data.type === 'sync');
    await api('POST', '/notifications/read-all', undefined, admin);
    assert.equal((await synced).type, 'sync');
    controller.abort();
  });
  async function connect(session, roomId = thread.id) {
    const socket = io(base, { auth: { token: session.accessToken }, transports: ['websocket'], reconnection: false, autoConnect: false });
    sockets.push(socket);
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); });
    const result = await socket.timeout(3000).emitWithAck('room:join', roomId);
    return { socket, result };
  }
  await t.test('authenticated room chat, room isolation, history and notifications', async () => {
    const otherThread = (await api('POST', '/threads', { title: 'Other room', content: 'Separate chat.' }, outsider)).data;
    const a = await connect(admin); const b = await connect(member); const c = await connect(outsider, otherThread.id);
    assert.deepEqual(a.result.messages, []);
    let leaked = false; c.socket.on('chat:message', () => { leaked = true; });
    const received = once(a.socket, 'chat:message');
    assert.equal((await b.socket.timeout(3000).emitWithAck('chat:message', { roomId: thread.id, text: 'Hello community!' })).ok, true);
    assert.equal((await received)[0].text, 'Hello community!');
    assert.equal(leaked, false);
    assert.match((await c.socket.timeout(3000).emitWithAck('chat:message', { roomId: thread.id, text: 'Unauthorized room' })).error, /Join/);
    const d = await connect(admin); assert.equal(d.result.messages[0].text, 'Hello community!');
    assert.equal((await api('GET', '/notifications', undefined, admin)).data.length, 2);
    const bad = io(base, { auth: { token: 'invalid' }, transports: ['websocket'], reconnection: false }); sockets.push(bad);
    const rejected = await once(bad, 'connect_error'); assert.match(rejected[0].message, /Session expired/);
    sockets.forEach(socket => socket.disconnect());
  });
  await t.test('malformed chat payloads, missing rooms and length limits do not crash server', async () => {
    const { socket } = await connect(member);
    assert.match((await socket.timeout(3000).emitWithAck('chat:message', null)).error, /Invalid/);
    assert.match((await socket.timeout(3000).emitWithAck('chat:message', { roomId: thread.id, text: ' ' })).error, /1–2000/);
    assert.match((await socket.timeout(3000).emitWithAck('chat:message', { roomId: thread.id, text: 'x'.repeat(2001) })).error, /1–2000/);
    assert.match((await socket.timeout(3000).emitWithAck('room:join', 'missing-room')).error, /not found/);
    socket.emit('room:join', null, 'invalid callback');
    socket.emit('chat:message', null, 'invalid callback');
    assert.equal((await api('GET', '/health')).status, 200);
    socket.disconnect();
  });
  await t.test('chat reconnect restores saved history and deleted rooms stop accepting messages', async () => {
    const { socket } = await connect(member);
    socket.disconnect();
    const reconnected = once(socket, 'connect'); socket.connect(); await reconnected;
    const history = await socket.timeout(3000).emitWithAck('room:join', thread.id);
    assert.equal(history.messages[0].text, 'Hello community!');
    const temporary = (await api('POST', '/threads', { title: 'Temporary live room', content: 'Room deletion test' }, member)).data;
    await socket.timeout(3000).emitWithAck('room:join', temporary.id);
    const deleted = once(socket, 'thread:deleted');
    assert.equal((await api('DELETE', `/threads/${temporary.id}`, undefined, member)).status, 200);
    assert.equal((await deleted)[0], temporary.id);
    assert.match((await socket.timeout(3000).emitWithAck('chat:message', { roomId: temporary.id, text: 'Cannot send' })).error, /Join/);
    socket.disconnect();
  });
  await t.test('profile name and avatar upload, file signatures and size limits', async () => {
    assert.equal((await api('PATCH', '/profile', { name: 'Updated Name' }, admin)).data.name, 'Updated Name');
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64');
    async function send(buffer, type) {
      const form = new FormData(); form.append('avatar', new Blob([buffer], { type }), 'avatar.png');
      const response = await fetch(`${base}/api/upload`, { method: 'POST', headers: { Authorization: `Bearer ${admin.accessToken}` }, body: form });
      return { status: response.status, data: await response.json() };
    }
    const result = await send(image, 'image/png'); assert.equal(result.status, 200);
    assert.equal((await fetch(`${base}${result.data.url}`)).status, 200);
    assert.equal((await send(Buffer.from('not an image'), 'image/png')).status, 400);
    assert.equal((await send(image, 'text/plain')).status, 400);
    assert.equal((await send(Buffer.alloc(5 * 1024 * 1024 + 1), 'image/png')).status, 413);
  });
  await t.test('data and sessions survive server restart', async () => {
    await stop(); await start();
    assert.equal((await api('GET', `/threads/${thread.id}`)).data.replies.length, 1);
    assert.equal((await api('POST', '/auth/refresh', undefined, undefined, admin.cookie)).status, 200);
    const persisted = new DatabaseSync(path.join(storage, 'community.sqlite'), { readOnly: true });
    const storedUser = JSON.parse(persisted.prepare('SELECT record FROM users LIMIT 1').get().record);
    assert.ok(storedUser.passwordHash); assert.equal(storedUser.password, undefined);
    assert.equal(persisted.prepare('SELECT count(*) AS total FROM messages').get().total, 1);
    assert.equal(persisted.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    persisted.close();
  });
  await t.test('missing upload files and profile boundary values are validated', async () => {
    assert.equal((await api('POST', '/upload', undefined, admin)).status, 400);
    assert.equal((await api('POST', '/upload')).status, 401);
    assert.equal((await api('PATCH', '/profile', { name: 'x' }, admin)).status, 400);
    assert.equal((await api('PATCH', '/profile', { name: 'x'.repeat(61) }, admin)).status, 400);
    assert.equal((await api('POST', '/threads', { title: 'x'.repeat(151), content: 'body' }, admin)).status, 400);
  });
  await t.test('logout disconnects active chat and stream connections for that session', async () => {
    const signedIn = await api('POST', '/auth/login', { email: 'member@example.test', password: 'testing-password-123' });
    const session = { ...signedIn.data, cookie: signedIn.cookie };
    const { socket } = await connect(session);
    const controller = new AbortController(); streams.push(controller);
    const response = await fetch(`${base}/api/notifications/stream`, { headers: { Authorization: `Bearer ${session.accessToken}` }, signal: controller.signal });
    const reader = response.body.getReader(); await streamEvent(reader, data => data.type === 'sync');
    const disconnected = once(socket, 'disconnect');
    await api('POST', '/auth/logout', undefined, undefined, session.cookie);
    await disconnected;
    assert.equal(socket.connected, false);
    assert.equal((await reader.read()).done, true);
    assert.equal((await api('GET', '/auth/me', undefined, session)).status, 401);
  });
  await t.test('owner/admin deletion and foreign owner rejection', async () => {
    assert.equal((await api('DELETE', `/threads/${thread.id}`, undefined, member)).status, 403);
    const own = (await api('POST', '/threads', { title: 'Owned', content: 'Delete me' }, member)).data;
    assert.equal((await api('DELETE', `/threads/${own.id}`, undefined, admin)).status, 200);
    assert.equal((await api('DELETE', `/threads/${thread.id}`, undefined, admin)).status, 200);
    assert.equal((await api('GET', `/threads/${thread.id}`)).status, 404);
    assert.equal((await api('GET', '/notifications', undefined, admin)).data.length, 0);
  });
  await t.test('logout revokes refresh and access tokens', async () => {
    assert.equal((await api('POST', '/auth/logout', undefined, undefined, admin.cookie)).status, 200);
    assert.equal((await api('POST', '/auth/refresh', undefined, undefined, admin.cookie)).status, 401);
    assert.equal((await api('GET', '/auth/me', undefined, admin)).status, 401);
  });
  await t.test('repeated failed logins are rate limited', async () => {
    let status;
    for (let attempt = 0; attempt < 35; attempt++) {
      status = (await api('POST', '/auth/login', { email: 'missing@example.test', password: 'bad' })).status;
      if (status === 429) break;
    }
    assert.equal(status, 429);
  });
});
