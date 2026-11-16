import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 3001);
const clientUrl = process.env.CLIENT_URL || process.env.RENDER_EXTERNAL_URL || (production ? '' : 'http://localhost:5173');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
let origin;
try { const url = new URL(clientUrl); if (url.origin !== clientUrl || !['http:', 'https:'].includes(url.protocol)) throw new Error(); origin = url.origin; }
catch { throw new Error('CLIENT_URL must be an exact HTTP(S) origin without a trailing slash.'); }
if (production && !origin.startsWith('https://')) throw new Error('Production CLIENT_URL must use HTTPS.');
if (production && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 64 || /replace|example|changeme/i.test(process.env.JWT_SECRET))) throw new Error('Production JWT_SECRET must be a unique random secret of at least 64 characters.');
const trustProxy = process.env.TRUST_PROXY || '0';
if (!['0', '1'].includes(trustProxy)) throw new Error('TRUST_PROXY must be 0 (direct) or 1 (one controlled reverse proxy).');
export const config = Object.freeze({
  production, port, clientUrl: origin, trustProxy: Number(trustProxy),
  host: process.env.HOST || '127.0.0.1',
  dataDir: path.resolve(process.env.DATA_DIR || path.join(root, 'data')),
  adminEmail: process.env.ADMIN_EMAIL?.trim().toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD,
});
