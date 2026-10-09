FROM node:24-slim
RUN groupadd -g 10001 runner && useradd -u 10001 -g 10001 -M -s /usr/sbin/nologin runner
RUN npm install --prefix /harness --save-exact typescript@5.9.3
COPY harness.mjs tsHelpers.js /harness/
ENV NODE_PATH=/harness/node_modules
# Execute-only and root-owned, so the harness process is non-dumpable (see harness.mjs).
RUN install -o root -g root -m 0111 "$(command -v node)" /harness/node
USER 10001:10001
ENTRYPOINT ["/harness/node", "--disable-sigusr1", "/harness/harness.mjs"]
