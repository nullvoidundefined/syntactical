FROM postgres:17
RUN apt-get update \
    && apt-get install -y --no-install-recommends jq \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 10001 runner \
    && useradd -u 10001 -g 10001 -M -d /tmp -s /usr/sbin/nologin runner
COPY harness.sh /harness/harness.sh
# Execute-only and root-owned, so the harness process is non-dumpable (see harness.sh).
RUN install -o root -g root -m 0111 /bin/bash /harness/bash
USER 10001:10001
ENV HOME=/tmp
ENTRYPOINT ["/harness/bash", "/harness/harness.sh"]
CMD []
