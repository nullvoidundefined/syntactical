# Deploying the API

The API ships as the image built from `server/Dockerfile`. GitHub Actions builds it, checks it, scans it, and pushes it to a private GitHub Container Registry package; Railway runs that pushed image as one service and never builds anything. (Railway's builder rejects BuildKit secret mounts, which the paid-content key needs.) The image starts itself: its `CMD` runs `server/scripts/start.sh`, so Railway needs no start command, healthcheck setting, or config file.

## Environment variables

Set these on the Railway service. The example column holds placeholders or public values, never a real secret.

| Name                         | Purpose                                                                                                                                                                                                                        | Secret | Example                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | --------------------------------------- |
| `NODE_ENV`                   | `production` on Railway. Production requires verified TLS to the database.                                                                                                                                                     | no     | `production`                            |
| `DATABASE_URL`               | Postgres connection string the server uses. A public host needs verified TLS (an `sslmode` of `disable`, `allow`, `prefer`, or `no-verify` is refused); a `*.railway.internal` host uses plain TCP inside the project network. | yes    | `${DATABASE_URL}`                       |
| `DATABASE_MIGRATION_URL`     | Optional direct (unpooled) URL used only by `node-pg-migrate up` at start. When unset, migrations use `DATABASE_URL`.                                                                                                          | yes    | `${DATABASE_MIGRATION_URL}`             |
| `ALLOWED_ORIGINS`            | Comma-separated exact web origins for CORS and the CSRF origin check.                                                                                                                                                          | no     | `https://syntactical.dev`               |
| `PUBLIC_BASE_URL`            | The API's own https origin, the one source for absolute URLs.                                                                                                                                                                  | no     | `https://api.syntactical.dev`           |
| `EMAIL_FROM`                 | Sender of the sign-in code email.                                                                                                                                                                                              | no     | `Syntactical <sign-in@syntactical.dev>` |
| `RESEND_API_KEY`             | Resend API credential for sign-in email.                                                                                                                                                                                       | yes    | `${RESEND_API_KEY}`                     |
| `RATE_LIMIT_KEY_SECRET`      | At least 32 characters; keys the rate limit counters.                                                                                                                                                                          | yes    | `${RATE_LIMIT_KEY_SECRET}`              |
| `REVENUECAT_WEBHOOK_AUTH`    | At least 32 characters; the exact `Authorization` header value RevenueCat sends to the webhook.                                                                                                                                | yes    | `${REVENUECAT_WEBHOOK_AUTH}`            |
| `PORT`                       | Listen port. Railway injects it; the server defaults to 3001.                                                                                                                                                                  | no     | `${PORT}`                               |
| `PAID_CONTENT_DIR`           | Where the paid banks sit. The image sets it to `/app/paid-content`; do not override it.                                                                                                                                        | no     | `/app/paid-content`                     |
| `CONTENT_DIR`                | The public content directory (manifest and free banks). The image sets it to `/app/content`.                                                                                                                                   | no     | `/app/content`                          |
| `ALLOW_STUBBED_INTEGRATIONS` | Exact value `true` lets a missing integration variable fall back to a fail-closed stub (see below). Leave unset once everything is configured.                                                                                 | no     | `true`                                  |

The server refuses to start, naming the variable and never its value, when a required variable is missing or invalid, unless `ALLOW_STUBBED_INTEGRATIONS` allows that one to be stubbed. It also refuses to start when a paid bank is missing or its hash differs from the manifest.

The read-only deploy key for the private `nullvoidundefined/syntactical-content` repo is the GitHub Actions secret `CONTENT_DEPLOY_KEY`. It is a CI build secret only and is never set on Railway.

## Deploying with missing secrets (stub mode)

Set `ALLOW_STUBBED_INTEGRATIONS=true` to deploy while some settings are still missing. Only `RESEND_API_KEY`, `EMAIL_FROM`, `REVENUECAT_WEBHOOK_AUTH`, `RATE_LIMIT_KEY_SECRET`, `ALLOWED_ORIGINS`, and `PUBLIC_BASE_URL` can be stubbed, and only when missing; `DATABASE_URL` never is. Each stub fails closed: no email is sent (so sign-in does not work until `RESEND_API_KEY` is set), the RevenueCat webhook answers 503 to every request, the rate limit key is random per boot (counters reset on restart), and no browser origin is allowed. Without the `CONTENT_DEPLOY_KEY` Actions secret, CI builds the image with the fixture banks instead (`CONTENT_SOURCE=fixture`), so the server starts but serves no real paid bank. The boot log and `/health/ready` (`"stubbed": [...]`) list what is stubbed. Everything to replace before launch is in [launch-placeholders.md](../docs/launch-placeholders.md).

## The image pipeline

`.github/workflows/server-image.yml` runs on every push to `main` that touches `server/`, `packages/`, `content/`, or `package-lock.json`. It builds the image (with the `content_deploy_key` secret mount when the `CONTENT_DEPLOY_KEY` Actions secret exists, otherwise with `CONTENT_SOURCE=fixture`), runs `checkImageHealth.sh` and `scanImageForKeys.sh` on it, and only then pushes `ghcr.io/nullvoidundefined/syntactical-api` with the tags `sha-<short sha>` and `main`. The image label `dev.syntactical.content` is `private` or `fixture`; check it before launch (`docker inspect --format '{{ index .Config.Labels "dev.syntactical.content" }}' <image>`). A `fixture` image serves no real paid bank.

**Keep the package private.** The image holds the paid banks. After the first push, open the package on GitHub (Packages, `syntactical-api`, Package settings) and confirm its visibility is Private; never make it public.

## Railway service settings

- Source: Docker image `ghcr.io/nullvoidundefined/syntactical-api:main`. No repo, root directory, Dockerfile path, or config file path is set.
- Registry credentials (set by the owner in the service's source settings, since the package is private): username `nullvoidundefined` and a GitHub token with `read:packages` only. Use a classic token with that single scope if a fine-grained token cannot read container packages. The token lives only in Railway's registry settings.
- Start command: leave it empty. The image `CMD` runs `node-pg-migrate up` against `DATABASE_MIGRATION_URL` when set, otherwise `DATABASE_URL`, then `exec node dist/index.js`. A failed migration stops the start before the new server takes traffic. `node-pg-migrate` reads the URL as given, so its TLS mode is not checked by the server's pool: `DATABASE_MIGRATION_URL` (and `DATABASE_URL` when it is the one used for migrations) must be a `*.railway.internal` host or carry `sslmode=verify-full`. Never use `disable`, `allow`, `prefer`, `require`, or `no-verify` there.
- Healthcheck path: `/health` (the image also carries its own `HEALTHCHECK`).
- The deploy key is not on Railway at all. It exists only as the GitHub Actions secret `CONTENT_DEPLOY_KEY`, so it is never injected into the running container.
- Custom domain: `api.syntactical.dev` (the owner adds the CNAME at the DNS host).

### Deploying a new image

A push to `main` moves the `main` tag, but Railway does not pull on its own. After the Server image workflow finishes, redeploy the service in Railway (Deployments, Redeploy), which pulls the current `main` image. To pin or roll back, set the service image to a `sha-<short sha>` tag instead and redeploy.

Local build with the real key (written to a file first): `docker build -f server/Dockerfile --secret id=content_deploy_key,src=<path to key file> .` Without a key, add `--build-arg CONTENT_SOURCE=fixture` to build with the fixture content under `server/ci-fixture`.

## Post-deploy checks

1. `curl -i https://api.syntactical.dev/health` returns 200 with `{"status":"ok"}`.
2. `curl -i https://api.syntactical.dev/health/ready` returns 200 with `{"database":"ok","status":"ok"}`.
3. In Safari, open `https://syntactical.dev` and confirm a credentialed fetch to the API works: sign in with an emailed code, then reload; the session cookie must be sent on the second request (the spec's Safari cookie assumption).
4. The Railway deploy log shows `Migrations complete!` and `server listening`, and no line naming a missing variable or a paid bank.
