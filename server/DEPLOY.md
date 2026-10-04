# Deploying the API

The API ships as the image built from `server/Dockerfile`. GitHub Actions builds and scans it, then uploads the same build context to Railway with `railway up`; Railway builds it from that upload and runs it as one service. Railway's builder rejects BuildKit secret mounts, so the paid-content deploy key is never used inside Docker or on Railway: it is a GitHub Actions secret that only `server/scripts/stageBuildContent.sh` reads on the CI runner. The image starts itself: its `CMD` runs `server/scripts/start.sh` (migrations, then the server), so Railway needs no start command.

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
| `RAILWAY_DOCKERFILE_PATH`    | Build variable. Makes Railway build `server/Dockerfile` instead of guessing with Railpack. The build setting in "Live environments and first-time setup" is what matters; this is a backup.                                    | no     | `server/Dockerfile`                     |
| `ALLOW_STUBBED_INTEGRATIONS` | Exact value `true` lets a missing integration variable fall back to a fail-closed stub (see below). Leave unset once everything is configured.                                                                                 | no     | `true`                                  |

The server refuses to start, naming the variable and never its value, when a required variable is missing or invalid, unless `ALLOW_STUBBED_INTEGRATIONS` allows that one to be stubbed. It also refuses to start when a paid bank is missing or its hash differs from the manifest.

The read-only deploy key for the private `nullvoidundefined/syntactical-content` repo is the GitHub Actions secret `CONTENT_DEPLOY_KEY`. It is a CI build secret only and is never set on Railway.

## Deploying with missing secrets (stub mode)

Set `ALLOW_STUBBED_INTEGRATIONS=true` to deploy while some settings are still missing. Only `RESEND_API_KEY`, `EMAIL_FROM`, `REVENUECAT_WEBHOOK_AUTH`, `RATE_LIMIT_KEY_SECRET`, `ALLOWED_ORIGINS`, and `PUBLIC_BASE_URL` can be stubbed, and only when missing; `DATABASE_URL` never is. Each stub fails closed: no email is sent (so sign-in does not work until `RESEND_API_KEY` is set), the RevenueCat webhook answers 503 to every request, the rate limit key is random per boot (counters reset on restart), and no browser origin is allowed. Without the `CONTENT_DEPLOY_KEY` Actions secret, CI builds the image with the fixture banks instead (`CONTENT_SOURCE=fixture`), so the server starts but serves no real paid bank. The boot log and `/health/ready` (`"stubbed": [...]`) list what is stubbed. Everything to replace before launch is in [launch-placeholders.md](../docs/launch-placeholders.md).

## The deploy pipeline

`.github/workflows/server-deploy.yml`:

- **Staging** deploys on every push to `main` that touches `server/`, `packages/`, `content/`, or `package-lock.json`.
- **Production** is a manual run (Actions, Server deploy, Run workflow, on `main`) and uses its own token.

Each job:

1. Stages the content with `server/scripts/stageBuildContent.sh`. With the `CONTENT_DEPLOY_KEY` secret it fetches the private `nullvoidundefined/syntactical-content` repo at the exact commit recorded in `content/paid-content.ref` (one 40-hex sha, validated before any network call; update it in the same PR as any manifest change) (key in a 0600 temp file outside the repo, removed on exit) and copies only the manifest-named, hash-checked paid banks into `build/paid-content`. Without the secret it stages the fixture content under `server/ci-fixture`, and the job summary says `fixture`. A fixture image serves no real paid bank.
2. Builds the image locally and runs `checkImageHealth.sh` and `scanImageForKeys.sh` (with its self-test) on it. A failure here stops the job before anything is uploaded.
3. Runs `server/scripts/deployToRailway.sh`: it copies the committed tree (`git archive HEAD`) plus `build/` into a clean temp directory outside the repo, refuses to upload if that directory holds `.git`, an env file, a PEM file, a deploy key, or an `id_*` file, and runs `railway up <dir> --path-as-root --ci --no-gitignore --service api --environment <env>`.

The image CI checked and the image Railway builds are two builds of the same Dockerfile and the same staged context, not one image.

Actions secrets (repository settings): `CONTENT_DEPLOY_KEY` (read-only deploy key for `syntactical-content`), `RAILWAY_TOKEN_STAGING`, and `RAILWAY_TOKEN_PRODUCTION`. Railway project tokens are scoped to one environment, which is why there are two. Each token is mapped to `RAILWAY_TOKEN` in its own job only. A job fails with a clear message when its token is empty. The Railway CLI version is pinned in the workflow.

## Railway service settings

- Service name: `api` in each environment, deployed by `railway up` from CI. No GitHub repo, root directory, or registry credentials are connected.
- Config: Railway applies nothing from a config file in this setup, so the settings live on the Railway service itself, per environment: build `{builder: DOCKERFILE, dockerfilePath: server/Dockerfile}` and deploy `{healthcheckPath: /health, healthcheckTimeout: 60, restartPolicyType: ON_FAILURE, restartPolicyMaxRetries: 5}`. Apply them with the environment patch below and read them back with `railway environment config --environment <env> --json`. There is no start command: the image `CMD` runs `node-pg-migrate up` against `DATABASE_MIGRATION_URL` when set, otherwise `DATABASE_URL`, then `exec node dist/index.js`. A failed migration stops the start before the new server takes traffic. `node-pg-migrate` reads the URL as given, so its TLS mode is not checked by the server's pool: `DATABASE_MIGRATION_URL` (and `DATABASE_URL` when it is the one used for migrations) must be a `*.railway.internal` host or carry `sslmode=verify-full`. Never use `disable`, `allow`, `prefer`, `require`, or `no-verify` there.
- Variables: the variables in the table above, including `RAILWAY_DOCKERFILE_PATH`. No other build or content variable is needed, because the content mode is decided by what CI stages into `build/`, and `CONTENT_DEPLOY_KEY` is never set on Railway, so it is never injected into the running container.
- Custom domain: `api.syntactical.dev`. The Cloudflare record does not exist yet; the owner adds a CNAME to the production Railway domain (below). Until then the apps' compiled production API URL does not resolve: add the CNAME or point the builds at the Railway URL.
- Redeploy: push to `main` (staging) or run the Server deploy workflow (production).

Observed on the first deploys (2026-10-04): `railway up` with a directory outside the working directory needs `--path-as-root` (`deployToRailway.sh` passes it), and `--no-gitignore` uploads the gitignored `build/` directory. Railway applies no config file from that upload in this setup, so the build and deploy settings live on the service; see the next section.

Local build: stage the content first, then build. `server/scripts/stageBuildContent.sh fixture` stages the fixture content; `CONTENT_DEPLOY_KEY="$(cat <path to key file>)" server/scripts/stageBuildContent.sh private` stages the real banks. Then `docker build -f server/Dockerfile .` from the repository root. `build/` is gitignored.

## Live environments and first-time setup

Observed on the first real deploys (2026-10-04). Follow this so a new environment works the first time.

| Environment | URL                                          | Neon branch (project `syntactical`, id `rough-paper-04073210`, aws-us-east-1) |
| ----------- | -------------------------------------------- | ----------------------------------------------------------------------------- |
| staging     | `https://api-staging-accd.up.railway.app`    | `staging`                                                                     |
| production  | `https://api-production-9973.up.railway.app` | `main`                                                                        |

Railway project `syntactical` (id `2ffc74bd-badb-47f1-9985-4d606dfa12ee`) has the environments `staging` and `production`, each with one service, `api`. Both currently run with `ALLOW_STUBBED_INTEGRATIONS=true` and the six stubs listed on `/health/ready`; see `docs/launch-placeholders.md` for what is still owed.

1. **Create the service instance in each environment and apply the service settings.** A Railway service created in one environment does not exist in the others. `railway up --environment X` fails with `Failed to upload code with status code 404 Not Found` until the service has an instance there. `railway environment edit --service-config` is not a substitute: it reports "No changes to apply" when the service has no instance. Use an environment patch through `railway api` instead (see "Environment patch" below). The same patch sets the build and deploy settings, because Railway applies nothing from `railway.json`.
2. **Set `RAILWAY_DOCKERFILE_PATH=server/Dockerfile` as a service variable on every environment's `api` service.** This is a belt-and-braces build variable; the build setting in step 1 is what matters. Railway applies no config file from the `railway up` upload. Without a Dockerfile setting, its default builder (Railpack) builds the root Expo app and the container crashes with `Cannot find module '/app/expo-router/entry'`.
3. **Set `NODE_ENV=production` on both environments.** The env schema accepts only `development`, `production`, and `test`. Staging is distinguished by the Railway environment, not by `NODE_ENV`.
4. **Do not connect the GitHub repo as the service source.** Railway's own builds cannot stage the private content and fail; only CI's `railway up` deploys. If a source gets connected (it is one way to create an instance), disconnect it with `railway service source disconnect`.
5. **Upload with `--path-as-root`** when the upload directory is outside the working directory; otherwise the CLI reports "prefix not found". `server/scripts/deployToRailway.sh` already does this.

### Environment patch

Read the ids first: `railway status --json` prints the project, environment, and service ids. Then commit a patch with `railway api`. The shape below is the one used on 2026-10-04 (ids are placeholders; check the field names against Railway's current schema if the call is rejected):

```
railway api --input - <<'JSON'
{
  "query": "mutation($environmentId: String!, $patch: EnvironmentConfig!) { environmentPatchCommit(environmentId: $environmentId, patch: $patch) }",
  "variables": {
    "environmentId": "<environment-id>",
    "patch": {
      "services": {
        "<service-id>": {
          "build": { "builder": "DOCKERFILE", "dockerfilePath": "server/Dockerfile" },
          "deploy": {
            "healthcheckPath": "/health",
            "healthcheckTimeout": 60,
            "restartPolicyType": "ON_FAILURE",
            "restartPolicyMaxRetries": 5
          }
        }
      }
    }
  }
}
JSON
```

A `services.<service-id>` entry for a service with no instance in that environment creates the instance; the same entry on an existing instance updates its settings. Confirm with `railway environment config --environment <env> --json`.

### Adding an environment

1. `railway environment new <name>`.
2. Run the environment patch above for the new environment, with its `<environment-id>` and the `api` `<service-id>`.
3. Set `NODE_ENV=production` and `RAILWAY_DOCKERFILE_PATH=server/Dockerfile` on the service in that environment.
4. Set `DATABASE_URL` from the matching Neon branch, piped so nothing is printed: `neonctl connection-string <branch> --ssl verify-full | railway variables --set DATABASE_URL --stdin --service api --environment <name>` (check `railway variables --help` for the stdin flag in your CLI version).
5. Create an environment-scoped project token and store it as a GitHub Actions secret, as below, then add the environment to `server-deploy.yml`.

### How the secrets were set (no copy-paste, nothing printed)

Every secret moved from its source to its destination through a pipe, so no human handled the value and nothing was echoed:

- Neon connection strings: `neonctl connection-string <branch> --ssl verify-full` piped into `railway variables --set` (the `staging` branch for the staging environment, `main` for production).
- Railway tokens: an environment-scoped project token created with `railway api` (the `projectTokenCreate` mutation) and piped into `gh secret set RAILWAY_TOKEN_STAGING` or `gh secret set RAILWAY_TOKEN_PRODUCTION`.
- The content deploy key: generated with `ssh-keygen`; the public half added as a read-only deploy key on `syntactical-content`, the private half piped into `gh secret set CONTENT_DEPLOY_KEY`.

### DNS

The `api.syntactical.dev` record (Cloudflare) does not exist yet. First add the custom domain on the Railway `api` service: `railway domain api.syntactical.dev --service api --environment production`. Railway then shows the CNAME target to use. Create that CNAME from `api` in Cloudflare (it points at the production Railway domain, currently `api-production-9973.up.railway.app`). For staging, see the `staging-api` row in `docs/launch-placeholders.md`.

## Post-deploy checks

1. `curl -i https://api.syntactical.dev/health` returns 200 with `{"status":"ok"}`.
2. `curl -i https://api.syntactical.dev/health/ready` returns 200 with `{"database":"ok","status":"ok"}`.
3. In Safari, open `https://syntactical.dev` and confirm a credentialed fetch to the API works: sign in with an emailed code, then reload; the session cookie must be sent on the second request (the spec's Safari cookie assumption).
4. The Railway deploy log shows `Migrations complete!` and `server listening`, and no line naming a missing variable or a paid bank.
