FROM ruby:3.4-slim
RUN groupadd -g 10001 runner && useradd -u 10001 -g 10001 -M -s /usr/sbin/nologin runner
COPY harness.rb /harness/harness.rb
USER 10001:10001
ENTRYPOINT ["ruby", "/harness/harness.rb"]
