# syntax=docker/dockerfile:1.7
#
# The API image. Build from the repository root, which holds the workspace packages the server
# imports (content-schema, progress). Stage the content first:
#
#   server/scripts/stageBuildContent.sh fixture      (or: private, with CONTENT_DEPLOY_KEY set)
#   docker build -f server/Dockerfile .
#
# The content comes from build/content and build/paid-content, which stageBuildContent.sh fills:
# the manifest and free banks from this repo, and the paid banks either from the private
# syntactical-content repo (cloned with a read-only deploy key, outside Docker) or from the fixture
# under server/ci-fixture. No key is used inside any Docker build, so none can be an ARG, an ENV,
# or a layer; Railway's builder, which rejects secret mounts, builds this file unchanged.
#
# The image starts itself: CMD runs scripts/start.sh (migrations, then the server), so a platform
# needs no start command.

ARG NODE_IMAGE=node:22.21.1-bookworm-slim

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

# Content: re-checks every staged bank against the manifest hash and copies only the files the
# manifest names, one access tier each.
FROM ${NODE_IMAGE} AS content
COPY server/scripts/copyContent.mjs /build/
COPY build/content /build/content
COPY build/paid-content /build/paid-content
RUN node /build/copyContent.mjs /build/content/manifest.json /build/content /public free \
    && node /build/copyContent.mjs /build/content/manifest.json /build/paid-content /paid paid

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
COPY server/scripts/start.sh server/scripts/start.sh
COPY --from=content /public /app/content
COPY --from=content --chown=node:node /paid /app/paid-content
RUN chmod -R go-rwx /app/paid-content
USER node
WORKDIR /app/server
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then((r)=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["sh", "scripts/start.sh"]
