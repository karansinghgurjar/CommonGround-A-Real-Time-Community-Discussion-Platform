import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
if (process.env.NODE_ENV === 'production') throw new Error('Root npm start is a development launcher. Use the production containers or start backend separately and serve frontend/dist with the supplied reverse proxy.');
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
function run(args, cwd) {
  const child = spawn(process.execPath, args, { cwd, stdio: 'inherit', windowsHide: true });
  children.push(child);
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code || 0); });
}
run(['--env-file-if-exists=.env', 'server.js'], path.join(root, 'backend'));
run(['node_modules/vite/bin/vite.js'], path.join(root, 'frontend'));
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
