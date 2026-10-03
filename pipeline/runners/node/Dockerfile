FROM node:24-slim
RUN groupadd -g 10001 runner && useradd -u 10001 -g 10001 -M -s /usr/sbin/nologin runner
COPY harness.mjs /harness/harness.mjs
USER 10001:10001
ENTRYPOINT ["node", "/harness/harness.mjs"]
