# Frontend

React/Vite application. All frontend code lives in this folder; the API lives independently in `../backend`.

```
npm ci
npm run dev
npm run lint
npm run build
```

Development proxies `/api`, `/socket.io` and `/uploads` to the backend on port 3001. Optional process environment overrides are `API_TARGET` and `FRONTEND_PORT`.

`dist/` is the production output. The Dockerfile builds it and serves it with the included Caddyfile; production does not run the Vite development or preview server. SPA routing, HTTPS, security headers, asset caching, API proxying, SSE and sockets are configured there.

Do not put server secrets in frontend environment variables. See the root `PRODUCTION.md` before operating a deployment.
