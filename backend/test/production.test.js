import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function command(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', part => { output += part; }); child.stderr.on('data', part => { output += part; });
    child.on('error', reject); child.on('exit', code => resolve({ code, output }));
  });
}
const productionEnv = { NODE_ENV: 'production', CLIENT_URL: 'https://community.example.test', JWT_SECRET: 'a'.repeat(64), TRUST_PROXY: '1', ADMIN_EMAIL: 'operator@example.test', ADMIN_PASSWORD: 'production-test-password-123' };

test('production configuration fails closed', async t => {
  const check = env => command(['--input-type=module', '-e', "await import('./config.js')"], { ...productionEnv, ...env });
  await t.test('rejects a missing or weak signing secret', async () => { assert.notEqual((await check({ JWT_SECRET: '' })).code, 0); assert.notEqual((await check({ JWT_SECRET: 'short' })).code, 0); });
  await t.test('rejects HTTP origins and unrestricted proxy trust', async () => { assert.notEqual((await check({ CLIENT_URL: 'http://example.test' })).code, 0); assert.notEqual((await check({ TRUST_PROXY: 'true' })).code, 0); });
  await t.test('accepts an explicit HTTPS production configuration', async () => { assert.equal((await check({})).code, 0); });
});

test('production runtime, migration, backups and process isolation', { timeout: 120000 }, async t => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'community-production-'));
  const backupDir = `${dataDir}-backup`;
  const port = 4600 + Math.floor(Math.random() * 500);
  const base = `http://127.0.0.1:${port}`;
  const env = { ...productionEnv, DATA_DIR: dataDir, PORT: String(port) };
  // Exercise migration of an existing JSON installation without overwriting it.
  const legacy = { secret: 'legacy-development-secret', users: [], sessions: [], threads: [], replies: [], messages: [], notifications: [] };
  await writeFile(path.join(dataDir, 'community.json'), JSON.stringify(legacy));
  let child;
  let output = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', part => { output += part; }); child.stderr.on('data', part => { output += part; });
    for (let attempt = 0; attempt < 300; attempt++) {
      try { if ((await fetch(`${base}/api/ready`)).ok) return; } catch { /* Wait for startup. */ }
      if (child.exitCode !== null) throw new Error(output);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Startup timed out: ${output}`);
  }
  async function stop() { if (child && child.exitCode === null) { const stopped = once(child, 'exit'); child.kill(); await stopped; } }
  t.after(async () => { await stop(); await rm(dataDir, { recursive: true, force: true }); await rm(backupDir, { recursive: true, force: true }); });
  async function request(route, body, token) {
    const response = await fetch(`${base}/api${route}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'X-Forwarded-Proto': 'https', Origin: productionEnv.CLIENT_URL, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { response, data: await response.json() };
  }
  await start();
  let admin;
  await t.test('provisions operator credentials and public registration stays member-only', async () => {
    admin = await request('/auth/login', { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
    assert.equal(admin.response.status, 200); assert.equal(admin.data.user.role, 'admin');
    const member = await request('/auth/register', { name: 'Public Member', email: 'public@example.test', password: 'member-password-123' });
    assert.equal(member.response.status, 201); assert.equal(member.data.user.role, 'member');
  });
  await t.test('production cookies, headers and HTTP enforcement are correct', async () => {
    const cookie = admin.response.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/i); assert.match(cookie, /Secure/i); assert.match(cookie, /SameSite=Strict/i);
    assert.equal(admin.response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(admin.response.headers.get('x-frame-options'), 'DENY');
    assert.match(admin.response.headers.get('strict-transport-security'), /31536000/);
    assert.equal(admin.response.headers.get('cache-control'), 'no-store');
    assert.ok(admin.response.headers.get('x-request-id'));
    assert.equal((await fetch(`${base}/api/threads`)).status, 400);
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
  });
  await t.test('database migration is valid and preserves the legacy source', async () => {
    assert.deepEqual(JSON.parse(await readFile(path.join(dataDir, 'community.json'), 'utf8')), legacy);
    const database = new DatabaseSync(path.join(dataDir, 'community.sqlite'), { readOnly: true });
    assert.equal(database.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.equal(database.prepare('SELECT count(*) AS total FROM users').get().total, 2);
    database.close();
  });
  await t.test('a second backend and a live backup cannot take the same writer lease', async () => {
    const second = await command(['server.js'], { ...env, PORT: String(port + 1) });
    assert.notEqual(second.code, 0); assert.match(second.output, /active backend or backup/);
    const backup = await command(['scripts/backup.js', backupDir], env);
    assert.notEqual(backup.code, 0); assert.match(backup.output, /Stop the backend/);
  });
  await t.test('offline backup and restore retain accounts and pass integrity checks', async () => {
    await stop();
    const backup = await command(['scripts/backup.js', backupDir], env);
    assert.equal(backup.code, 0, backup.output);
    const database = new DatabaseSync(path.join(backupDir, 'community.sqlite'), { readOnly: true });
    assert.equal(database.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.equal(database.prepare('SELECT count(*) AS total FROM users').get().total, 2);
    database.close();
    env.DATA_DIR = backupDir;
    await start();
    const restored = await request('/auth/login', { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
    assert.equal(restored.response.status, 200); assert.equal(restored.data.user.role, 'admin');
  });
});
