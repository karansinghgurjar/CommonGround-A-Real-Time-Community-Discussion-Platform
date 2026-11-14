import { randomUUID } from 'node:crypto';
import { config } from './config.js';

export function security(req, res, next) {
  req.requestId = randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cache-Control', 'no-store');
  if (config.production) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  const healthProbe = req.method === 'GET' && ['/api/health', '/api/ready'].includes(req.path);
  if (config.production && !req.secure && !healthProbe) return res.status(400).json({ message: 'HTTPS is required.' });
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin && req.headers.origin !== config.clientUrl) return res.status(403).json({ message: 'Origin not allowed.' });
  if (config.production && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ message: 'Cross-site request blocked.' });
  res.on('finish', () => {
    if (config.production) console.log(JSON.stringify({ event: 'request', requestId: req.requestId, method: req.method, path: req.path, status: res.statusCode }));
  });
  next();
}
export function rateLimit({ windowMs, limit }) {
  const entries = new Map();
  const cleanup = setInterval(() => { for (const [key, entry] of entries) if (entry.until <= Date.now()) entries.delete(key); }, windowMs);
  cleanup.unref();
  return (req, res, next) => {
    const key = req.user?.id || req.ip;
    let entry = entries.get(key);
    if (!entry || entry.until <= Date.now()) { entry = { count: 0, until: Date.now() + windowMs }; entries.set(key, entry); }
    entry.count++;
    if (entry.count > limit) {
      res.setHeader('Retry-After', String(Math.ceil((entry.until - Date.now()) / 1000)));
      return res.status(429).json({ message: 'Too many requests. Please wait and try again.' });
    }
    next();
  };
}
