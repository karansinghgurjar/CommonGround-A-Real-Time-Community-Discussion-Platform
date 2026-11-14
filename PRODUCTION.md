# Production preparation

No deployment, cloud resource, domain change or public listener was created. These files prepare the application for a **single-host, single-backend** production installation.

## Architecture

The frontend image builds React with Vite, then serves only compiled static files through Caddy. Caddy terminates HTTPS, redirects HTTP, handles SPA routes and proxies `/api/*`, `/socket.io/*`, and `/uploads/*` to the backend. Streaming notifications flush immediately; WebSocket upgrades are preserved. Hashed assets use immutable caching; HTML is revalidated.

The backend image runs Node 24 LTS as the non-root `node` user, with a read-only application filesystem and a writable data volume. The API port is private to the Compose network; only Caddy publishes host ports. `TRUST_PROXY=1` is valid only for this single controlled proxy. Do not publish backend port 3001 directly to the internet or insert extra proxies without reviewing this setting.

SQLite uses WAL, full synchronization, transactions, unique email indexing, versioned schema initialization, rollback on failed writes, and a separate OS-backed process lease. The application keeps a working state in memory and writes changed records transactionally. This is suitable for a modest single-server community; it is not an implementation for unbounded datasets or horizontal scaling.

## Configuration to supply before a future deployment

Copy `.env.production.example` to `.env.production` and replace every placeholder:

| Variable | Required value |
| --- | --- |
| `APP_DOMAIN` | Your hostname without scheme/path, e.g. `community.yourdomain.com` |
| `JWT_SECRET` | A unique random secret of at least 64 characters; generate with `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"` |
| `ADMIN_EMAIL` | Operator-controlled initial administrator email |
| `ADMIN_PASSWORD` | Unique initial password, 16–128 characters |

Keep this file private and outside version control. Compose passes credentials only to the backend. Do not use `VITE_` variables for secrets. The checked-in example is intentionally not usable as production credentials.

Production startup refuses missing/weak JWT secrets, HTTP client origins and unrestricted proxy trust. On a new database with no administrator, it requires `ADMIN_EMAIL` and `ADMIN_PASSWORD`, then provisions the account using a salted scrypt password hash. Public registration never grants administrator privileges in production. Existing administrators are preserved; bootstrap environment changes do not reset existing passwords. After initial provisioning, remove ADMIN_PASSWORD from `.env.production` and recreate the backend container so it no longer retains the initial plaintext bootstrap password. Compose permits empty bootstrap values for an already initialized database. Use an operator secret manager for ongoing secret handling.

Secure HTTP-only SameSite cookies require HTTPS. Same-origin frontend/API routing is intentional. Token refresh never relies on localStorage. Authorization is enforced in the API, including admin/owner deletion, notification ownership, upload access and socket sessions. Access tokens include an algorithm restriction, issuer, audience and expiry.

## Commands for the operator (not executed as part of preparation)

Validate configuration without starting services:

```
docker compose --env-file .env.production config --quiet
docker compose --env-file .env.production build
```

Only when you decide to deploy, point DNS to the host, permit inbound ports 80/443, then run:

```
docker compose --env-file .env.production up -d
```

Caddy needs reachable DNS and ports to obtain public certificates. The examples do not include a real hostname, certificate or hosting account.

## Health, logging and shutdown

- `/api/health` reports process liveness; `/api/ready` checks SQLite connectivity. These two probes permit internal HTTP; all other production API requests require HTTPS as reported by the controlled proxy.
- Docker checks backend readiness before starting the frontend. Runtime health status still needs external monitoring and alerting; no monitoring service was created.
- Production request logs contain request IDs, method, path and status. They exclude request bodies, cookies, authorization headers and query strings. Backend and frontend Docker logs rotate at 10 MB, with three files.
- SIGTERM/SIGINT close SSE and socket connections, stop accepting requests, checkpoint SQLite and close the store. A ten-second timeout bounds shutdown. Compose allows fifteen seconds.
- Rate limits protect authentication, general API traffic, writes, uploads and chat sends. SSE connections are capped per user. These limits are per-process, consistent with the supported single-backend topology.
- Monitor free disk space, failed requests, memory usage and backup age. Container restart policies are configured, but application availability still depends on the host.

## Backup and restore

Database and upload files must be backed up together. `backend/scripts/backup.js` refuses to run while a backend owns the data lease. It creates a SQLite-consistent backup, copies uploads and writes a manifest to a new destination directory. Copy backups off-host and encrypt them; they contain private user records and session data.

For a local installation, stop the backend, then run from `backend/`:

```
node --env-file-if-exists=.env scripts/backup.js ABSOLUTE_NEW_BACKUP_DIRECTORY
```

For a Compose installation (after it is deployed), stop the backend and run an offline job using the same data volume:

```
docker compose --env-file .env.production stop backend
docker compose --env-file .env.production run --rm --no-deps backend node scripts/backup.js
```

The default destination is a timestamped folder under `/app/data/backups`; copy that folder to protected off-host storage. Then start the backend again. The frontend can return temporary unavailable errors while the API is stopped. Do not run this process without allowing for the maintenance window.

To restore: stop the backend; preserve the current data directory; restore the backed-up `community.sqlite` and `uploads/` into an empty local data directory/volume; restore appropriate ownership for the `node` user; start with the same production JWT secret; verify `/api/ready`, account login, a discussion, an avatar and chat history. Do not copy an old WAL file alongside a restored database. If changing JWT_SECRET, existing access tokens become invalid and clients refresh using their persisted sessions. Restore is tested against isolated data in `production.test.js`.

## Verification status

`npm run check` verifies source lint, frontend production compilation, API/client flows, production startup rules, secure cookies/headers, legacy import, SQLite integrity, process isolation, offline backup and restore. `npm audit --omit=dev` checks runtime dependency advisories. CI repeats these checks and validates Caddy/builds both images.

Verified locally: all 38 automated checks, frontend lint/build, zero known npm advisories across both dependency trees, Compose configuration, both production image builds, Caddy configuration validation, and a network-isolated backend image smoke check for non-root operation, read-only root filesystem, administrator provisioning and SQLite integrity. Base images are pinned by version and digest. Docker was used only for image builds and temporary validation commands; no production application services were started.

A public HTTPS end-to-end test still requires your real hostname, DNS, credentials and certificates. No certificate issuance or deployment has been attempted. CI checks are prepared in the repository; they have not been executed on a remote GitHub runner in this session.

## Reference documentation

- Node SQLite API: https://nodejs.org/docs/latest-v24.x/api/sqlite.html
- Caddy reverse proxy and streaming: https://caddyserver.com/docs/caddyfile/directives/reverse_proxy
- Pinned Caddy release: https://github.com/caddyserver/caddy/releases/tag/v2.11.7
