# Deploying the API

The API ships as the image built from `server/Dockerfile` and runs on Railway as one service.

## Environment variables

Set these on the Railway service. The example column holds placeholders or public values, never a real secret.

| Name                      | Purpose                                                                                                                                                                                                                        | Secret | Example                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | --------------------------------------- |
| `NODE_ENV`                | `production` on Railway. Production requires verified TLS to the database.                                                                                                                                                     | no     | `production`                            |
| `DATABASE_URL`            | Postgres connection string the server uses. A public host needs verified TLS (an `sslmode` of `disable`, `allow`, `prefer`, or `no-verify` is refused); a `*.railway.internal` host uses plain TCP inside the project network. | yes    | `${DATABASE_URL}`                       |
| `DATABASE_MIGRATION_URL`  | Optional direct (unpooled) URL used only by `node-pg-migrate up` at start. When unset, migrations use `DATABASE_URL`.                                                                                                          | yes    | `${DATABASE_MIGRATION_URL}`             |
| `ALLOWED_ORIGINS`         | Comma-separated exact web origins for CORS and the CSRF origin check.                                                                                                                                                          | no     | `https://syntactical.dev`               |
| `PUBLIC_BASE_URL`         | The API's own https origin, the one source for absolute URLs.                                                                                                                                                                  | no     | `https://api.syntactical.dev`           |
| `EMAIL_FROM`              | Sender of the sign-in code email.                                                                                                                                                                                              | no     | `Syntactical <sign-in@syntactical.dev>` |
| `RESEND_API_KEY`          | Resend API credential for sign-in email.                                                                                                                                                                                       | yes    | `${RESEND_API_KEY}`                     |
| `RATE_LIMIT_KEY_SECRET`   | At least 32 characters; keys the rate limit counters.                                                                                                                                                                          | yes    | `${RATE_LIMIT_KEY_SECRET}`              |
| `REVENUECAT_WEBHOOK_AUTH` | At least 32 characters; the exact `Authorization` header value RevenueCat sends to the webhook.                                                                                                                                | yes    | `${REVENUECAT_WEBHOOK_AUTH}`            |
| `PORT`                    | Listen port. Railway injects it; the server defaults to 3001.                                                                                                                                                                  | no     | `${PORT}`                               |
| `PAID_CONTENT_DIR`        | Where the paid banks sit. The image sets it to `/app/paid-content`; do not override it.                                                                                                                                        | no     | `/app/paid-content`                     |
| `CONTENT_DIR`             | The public content directory (manifest and free banks). The image sets it to `/app/content`.                                                                                                                                   | no     | `/app/content`                          |

The server refuses to start, naming the variable and never its value, when a required variable is missing or invalid. It also refuses to start when a paid bank is missing or its hash differs from the manifest.

Build time only in intent, but see the note below on Railway: the read-only deploy key for the private `nullvoidundefined/syntactical-content` repo, stored as the Railway service variable `CONTENT_DEPLOY_KEY` (secret, placeholder `${CONTENT_DEPLOY_KEY}`). It reaches the build only as a BuildKit secret mount.

## Deploying with missing secrets (stub mode)

Set `ALLOW_STUBBED_INTEGRATIONS=true` to deploy while some settings are still missing. Only `RESEND_API_KEY`, `EMAIL_FROM`, `REVENUECAT_WEBHOOK_AUTH`, `RATE_LIMIT_KEY_SECRET`, `ALLOWED_ORIGINS`, and `PUBLIC_BASE_URL` can be stubbed, and only when missing; `DATABASE_URL` never is. Each stub fails closed: no email is sent (so sign-in does not work until `RESEND_API_KEY` is set), the RevenueCat webhook answers 503 to every request, the rate limit key is random per boot (counters reset on restart), and no browser origin is allowed. For paid content without the deploy key, set the service variable `CONTENT_SOURCE=fixture` so the image builds with the fixture banks. The boot log and `/health/ready` (`"stubbed": [...]`) list what is stubbed. Everything to replace before launch is in [launch-placeholders.md](../docs/launch-placeholders.md).

## Railway service settings

- Source: this repo, root directory the repository root (the image needs `packages/content-schema` and `packages/progress`).
- Config as code file path: `/server/railway.json`. It sets the Dockerfile builder, `server/Dockerfile`, the start command, and the `/health` healthcheck.
- Start command (from `railway.json`): runs `node-pg-migrate up` against `DATABASE_MIGRATION_URL` when set, otherwise `DATABASE_URL`, then `exec node dist/index.js`. A failed migration stops the deploy before the new server takes traffic. `node-pg-migrate` reads the URL as given, so its TLS mode is not checked by the server's pool: `DATABASE_MIGRATION_URL` (and `DATABASE_URL` when it is the one used for migrations) must be a `*.railway.internal` host or carry `sslmode=verify-full`. Never use `disable`, `allow`, `prefer`, `require`, or `no-verify` there.
- Deploy key for the build (the `content_deploy_key` build secret): Railway exposes service variables to the Dockerfile build, so add the service variable named `CONTENT_DEPLOY_KEY` holding the private key text. The Dockerfile reads it from a BuildKit secret mount of that name, and also accepts the lowercase name `content_deploy_key` that CI and local builds use. Never pass it as a build argument.
- Runtime exposure of the deploy key: Railway also injects every service variable into the running container, so a `CONTENT_DEPLOY_KEY` service variable is visible to the running server process. The key is read-only and guards content the image already holds, so the added exposure is small. To avoid it, build the image in CI (where the key is a build secret only), push it to a registry, and deploy the pushed image instead of building on Railway.
- Healthcheck path: `/health`.
- Custom domain: `api.syntactical.dev` (the owner adds the CNAME at the DNS host).

Local build with the real key (written to a file first): `docker build -f server/Dockerfile --secret id=content_deploy_key,src=<path to key file> .` Without a key, add `--build-arg CONTENT_SOURCE=fixture` to build with the fixture content under `server/ci-fixture`.

## Post-deploy checks

1. `curl -i https://api.syntactical.dev/health` returns 200 with `{"status":"ok"}`.
2. `curl -i https://api.syntactical.dev/health/ready` returns 200 with `{"database":"ok","status":"ok"}`.
3. In Safari, open `https://syntactical.dev` and confirm a credentialed fetch to the API works: sign in with an emailed code, then reload; the session cookie must be sent on the second request (the spec's Safari cookie assumption).
4. The Railway deploy log shows `Migrations complete!` and `server listening`, and no line naming a missing variable or a paid bank.
