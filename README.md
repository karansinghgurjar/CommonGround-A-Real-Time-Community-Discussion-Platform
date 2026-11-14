# Commonground

A community discussion app with accounts, threads, replies, live room chat, notifications, avatar uploads, profiles, and administrator moderation.

## Project layout

```
frontend/       React/Vite source, independent package/lockfile, static build, Caddyfile, Dockerfile
backend/        Express/Socket.IO API, independent package/lockfile, SQLite migrations, tests, Dockerfile
compose.yaml    Production services and persistent volumes (not started automatically)
.github/        CI checks and production image-build validation
PRODUCTION.md   Production configuration, verification, backup and restore instructions
```

The old `frontend/react project` nesting has been removed. Frontend and backend build independently. The frontend contains no server credentials and uses `/api`, `/socket.io`, and `/uploads` on its own origin. The backend does not depend on Vite.

## Local development

Use Node 24 LTS (at least 24.15; version files and production images pin 24.22.1):

```
npm ci --prefix backend
npm ci --prefix frontend
npm run dev
```

Open http://localhost:5173. `npm start` is also a development convenience launcher. It refuses to run in production mode, where Vite's dev server is inappropriate.

You can also run `npm run dev` inside each folder in two terminals. The first **development** account becomes administrator. Production creates an operator-provisioned administrator and all public registrations are members.

## Verification

```
npm run check
```

This runs frontend lint, all client/API/production tests, and a production frontend build. Tests use isolated temporary databases, not your application data. CI additionally audits runtime dependencies, validates Caddy configuration, and builds both production images.

## Production preparation

The repository includes separate production images, HTTPS reverse-proxy configuration, persistent storage, health probes, startup validation, secure cookies, origin checks, bounded rate limits, a non-root API container, log rotation and graceful shutdown. Nothing has been deployed. Follow `PRODUCTION.md` when you choose to configure a deployment.

## Storage

`backend/data/community.sqlite` is the transactional source of truth; uploads are in `backend/data/uploads`. An existing `community.json` is imported only when initializing a fresh database and is preserved unchanged as a migration source. Once migration succeeds, SQLite is authoritative.

The supported production topology is **one backend process on one server**, with a local persistent volume and one public HTTPS origin. An OS-backed SQLite writer lease rejects a second backend against the same data directory and releases automatically after a crash. Do not use multiple replicas or a network-mounted SQLite volume. A multi-server deployment requires a shared database, Socket.IO adapter, notification transport, shared upload storage, and distributed rate limits.

See `FEATURE-CHECKLIST.md` for feature coverage and `PRODUCTION.md` for operational details.
