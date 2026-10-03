FROM postgres:17
RUN apt-get update \
    && apt-get install -y --no-install-recommends jq \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 10001 runner \
    && useradd -u 10001 -g 10001 -M -d /tmp -s /usr/sbin/nologin runner
COPY harness.sh /harness/harness.sh
USER 10001:10001
ENV HOME=/tmp
ENTRYPOINT ["bash", "/harness/harness.sh"]
CMD []
