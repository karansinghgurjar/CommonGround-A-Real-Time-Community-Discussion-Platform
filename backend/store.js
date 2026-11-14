import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

export const root = path.dirname(fileURLToPath(import.meta.url));
export const dataDir = config.dataDir;
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
// A separate SQLite transaction provides a crash-safe process lease. Unlike PID
// files, OS-backed locks also work when containers restart with reused PIDs.
const writerLease = new DatabaseSync(path.join(dataDir, '.writer-lock.sqlite'));
try { writerLease.exec('PRAGMA busy_timeout=0; BEGIN EXCLUSIVE; CREATE TABLE IF NOT EXISTS lease (id INTEGER);'); }
catch { writerLease.close(); throw new Error('DATA_DIR already has an active backend or backup process. Use one backend replica.'); }
process.once('exit', () => { try { writerLease.close(); } catch { /* Already released. */ } });
export const database = new DatabaseSync(path.join(dataDir, 'community.sqlite'));
database.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;');
const schemaVersion = database.prepare('PRAGMA user_version').get().user_version;
if (schemaVersion > 1) throw new Error('This database schema is newer than the application. Refusing to downgrade.');
if (schemaVersion === 0) database.exec(fs.readFileSync(path.join(root, 'migrations/001_initial.sql'), 'utf8'));
const collections = ['users', 'sessions', 'threads', 'replies', 'messages', 'notifications'];
const statements = new Map(collections.map(name => [name, {
  upsert: database.prepare(`INSERT INTO ${name}(id, record) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET record=excluded.record`),
  remove: database.prepare(`DELETE FROM ${name} WHERE id=?`),
}]));
const existing = database.prepare("SELECT value FROM settings WHERE key = 'secret'").get();
const legacyFile = path.join(dataDir, 'community.json');
const legacy = !existing && fs.existsSync(legacyFile) ? JSON.parse(fs.readFileSync(legacyFile, 'utf8')) : null;
export const db = { secret: existing?.value || legacy?.secret || randomBytes(48).toString('hex') };
const snapshots = new Map();
for (const name of collections) {
  const rows = database.prepare(`SELECT id, record FROM ${name} ORDER BY rowid`).all();
  db[name] = legacy ? legacy[name] || [] : rows.map(row => JSON.parse(row.record));
  snapshots.set(name, new Map(rows.map(row => [row.id, row.record])));
}
export function save() {
  const next = new Map();
  database.exec('BEGIN IMMEDIATE');
  try {
    database.prepare("INSERT INTO settings(key, value) VALUES ('secret', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(db.secret);
    for (const name of collections) {
      const before = snapshots.get(name);
      const after = new Map(db[name].map(record => [record.id, JSON.stringify(record)]));
      const { upsert, remove } = statements.get(name);
      for (const [id, record] of after) if (before.get(id) !== record) upsert.run(id, record);
      for (const id of before.keys()) if (!after.has(id)) remove.run(id);
      next.set(name, after);
    }
    database.exec('COMMIT');
    for (const [name, snapshot] of next) snapshots.set(name, snapshot);
  } catch (error) {
    database.exec('ROLLBACK');
    // Failed writes must not remain visible in the in-memory working state.
    for (const name of collections) {
      const rows = database.prepare(`SELECT id, record FROM ${name} ORDER BY rowid`).all();
      db[name] = rows.map(row => JSON.parse(row.record));
      snapshots.set(name, new Map(rows.map(row => [row.id, row.record])));
    }
    throw error;
  }
}
if (config.production && !db.users.some(user => user.role === 'admin')) {
  if (!config.adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.adminEmail) || !config.adminPassword || config.adminPassword.length < 16 || config.adminPassword.length > 128 || /REPLACE_WITH_|changeme/i.test(config.adminPassword)) throw new Error('First production startup requires ADMIN_EMAIL and a unique ADMIN_PASSWORD (16–128 characters).');
  const salt = randomBytes(16).toString('hex');
  const existingUser = db.users.find(user => user.email === config.adminEmail);
  if (existingUser) throw new Error('ADMIN_EMAIL belongs to a non-admin account. Provision an administrator explicitly before startup.');
  db.users.push({ id: randomUUID(), name: 'Administrator', email: config.adminEmail, salt, passwordHash: scryptSync(config.adminPassword, salt, 64).toString('hex'), role: 'admin', createdAt: new Date().toISOString(), avatar: '' });
}
save();
export function closeStore() { database.exec('PRAGMA wal_checkpoint(TRUNCATE)'); database.close(); writerLease.close(); }
export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar || '' };
}
export function presentThread(thread) {
  const author = db.users.find(user => user.id === thread.authorId);
  return { ...thread, author: author?.name || 'Deleted user', authorName: author?.name || 'Deleted user', authorAvatar: author?.avatar || '', replyCount: db.replies.filter(reply => reply.threadId === thread.id).length };
}
