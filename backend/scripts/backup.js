import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync, backup } from 'node:sqlite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
const output = path.resolve(process.argv[2] || path.join(dataDir, 'backups', new Date().toISOString().replace(/[:.]/g, '-')));
if (fs.existsSync(output)) throw new Error('Backup destination already exists. Choose a new folder.');
const lease = new DatabaseSync(path.join(dataDir, '.writer-lock.sqlite'));
try {
  try { lease.exec('PRAGMA busy_timeout=0; BEGIN EXCLUSIVE;'); }
  catch { throw new Error('Stop the backend before backing up the database and uploads together.'); }
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  const source = new DatabaseSync(path.join(dataDir, 'community.sqlite'), { readOnly: true });
  try { await backup(source, path.join(output, 'community.sqlite')); }
  finally { source.close(); }
  if (fs.existsSync(path.join(dataDir, 'uploads'))) fs.cpSync(path.join(dataDir, 'uploads'), path.join(output, 'uploads'), { recursive: true });
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ version: 1, createdAt: new Date().toISOString(), files: ['community.sqlite', 'uploads/'] }, null, 2));
  console.log(JSON.stringify({ event: 'backup_complete', output }));
} finally { lease.close(); }
