FROM golang:1.25-bookworm AS harness
COPY harness.go harness_test.go /src/
RUN cd /src && go test harness.go harness_test.go && CGO_ENABLED=0 go build -o /harness harness.go

FROM golang:1.25-bookworm
ENV GOTOOLCHAIN=local GOPROXY=off CGO_ENABLED=0
# Warm a build cache for the standard library packages oracles use, with the same flags the
# harness builds with, so a run compiles only the oracle itself.
COPY warm.go /warm/main.go
RUN cd /warm && GOCACHE=/gocache GOFLAGS=-mod=mod go build -p 1 -o /dev/null main.go \
    && chmod -R a+rX /gocache && rm -rf /warm
RUN groupadd -g 10001 runner && useradd -u 10001 -g 10001 -M -s /usr/sbin/nologin runner
COPY --from=harness /harness /harness/harness
USER 10001:10001
ENTRYPOINT ["/harness/harness"]
