# syntax=docker/dockerfile:1.7
#
# The API image. Build from the repository root, which holds the workspace packages the server
# imports (content-schema, progress):
#
#   docker build -f server/Dockerfile --secret id=content_deploy_key,src=<key file> .
#
# CONTENT_SOURCE picks where the content comes from:
#   private  (default) the public content from this repo, the paid banks from the private
#            syntactical-content repo, cloned with a read-only deploy key that only a BuildKit
#            secret mount carries.
#   fixture  the tiny content set under server/ci-fixture, so CI can build and run the image
#            without the key.
# The key is never an ARG, an ENV, a layer, or a file under any .ssh directory in any stage.

ARG NODE_IMAGE=node:22.21.1-bookworm-slim
ARG CONTENT_SOURCE=private

# Installs the server's dependencies and compiles the shared packages and the server.
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/content-schema/package.json packages/content-schema/
COPY packages/progress/package.json packages/progress/
COPY pipeline/package.json pipeline/
COPY server/package.json server/
RUN npm ci --ignore-scripts --no-audit --no-fund --workspace @syntactical/server
COPY packages packages
COPY server server
RUN npm run build --workspace @syntactical/content-schema --workspace @syntactical/progress --workspace @syntactical/server
# Build smoke test: the compiled server and the shared packages it imports load, so a missing
# build output fails the build rather than the first request.
RUN node --input-type=module -e "await import('/app/server/dist/startServer.js')"

# Public content: the manifest and the free banks only.
FROM ${NODE_IMAGE} AS public-content-private
COPY server/scripts/copyContent.mjs /build/
COPY content /build/content
RUN node /build/copyContent.mjs /build/content/manifest.json /build/content /public free

FROM ${NODE_IMAGE} AS public-content-fixture
COPY server/scripts/copyContent.mjs /build/
COPY server/ci-fixture/public /build/content
RUN node /build/copyContent.mjs /build/content/manifest.json /build/content /public free

# Paid content from the private repo. The deploy key is read from a secret mount, which Docker
# never writes to a layer. It is copied to a mode 0600 file under /tmp (not ~/.ssh), used for one
# clone, and this whole stage is discarded: only the paid bank files the manifest names are
# copied on, so neither the key nor the clone's .git reaches the runtime image. The secret id
# content_deploy_key is the CI and local name; Railway exposes a service variable under its own
# name, so CONTENT_DEPLOY_KEY is accepted too.
FROM ${NODE_IMAGE} AS paid-content-private
ARG CONTENT_REPO=git@github.com:nullvoidundefined/syntactical-content.git
ARG CONTENT_REF=main
RUN apt-get update \
    && apt-get install -y --no-install-recommends git openssh-client \
    && rm -rf /var/lib/apt/lists/*
COPY server/scripts/copyContent.mjs /build/
COPY content/manifest.json /build/manifest.json
# Trust only GitHub's published ed25519 host key: the scanned key must match the pinned
# fingerprint, or the build fails.
RUN ssh-keyscan -t ed25519 github.com > /tmp/known_hosts 2>/dev/null \
    && ssh-keygen -lf /tmp/known_hosts | grep -q 'SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU'
RUN --mount=type=secret,id=content_deploy_key,required=false \
    --mount=type=secret,id=CONTENT_DEPLOY_KEY,required=false \
    set -eu; \
    keyfile=/run/secrets/content_deploy_key; \
    [ -s "$keyfile" ] || keyfile=/run/secrets/CONTENT_DEPLOY_KEY; \
    [ -s "$keyfile" ] || { echo 'build secret content_deploy_key is not set' >&2; exit 1; }; \
    umask 077; \
    { cat "$keyfile"; printf '\n'; } > /tmp/deploy_key; \
    GIT_SSH_COMMAND='ssh -i /tmp/deploy_key -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/tmp/known_hosts' \
        git clone --quiet --depth 1 --branch "$CONTENT_REF" "$CONTENT_REPO" /tmp/content; \
    rm -f /tmp/deploy_key; \
    node /build/copyContent.mjs /build/manifest.json /tmp/content /paid paid; \
    rm -rf /tmp/content

FROM ${NODE_IMAGE} AS paid-content-fixture
COPY server/scripts/copyContent.mjs /build/
COPY server/ci-fixture/public/manifest.json /build/manifest.json
COPY server/ci-fixture/paid /build/paid
RUN node /build/copyContent.mjs /build/manifest.json /build/paid /paid paid

FROM public-content-${CONTENT_SOURCE} AS public-content
FROM paid-content-${CONTENT_SOURCE} AS paid-content

# Runtime: production dependencies, build output, migrations, and content. No compiler, no key.
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    CONTENT_DIR=/app/content \
    PAID_CONTENT_DIR=/app/paid-content
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/content-schema/package.json packages/content-schema/
COPY packages/progress/package.json packages/progress/
COPY pipeline/package.json pipeline/
COPY server/package.json server/
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund --workspace @syntactical/server \
    && npm cache clean --force
COPY --from=builder /app/packages/content-schema/dist packages/content-schema/dist
COPY --from=builder /app/packages/progress/dist packages/progress/dist
COPY --from=builder /app/server/dist server/dist
COPY server/migrations server/migrations
COPY --from=public-content /public /app/content
COPY --from=paid-content --chown=node:node /paid /app/paid-content
RUN chmod -R go-rwx /app/paid-content
USER node
WORKDIR /app/server
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then((r)=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/index.js"]
