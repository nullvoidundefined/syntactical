# Oracle harness: PID 1 cannot be forged or killed by the oracle

**Risk:** high (sandbox control)

## Goal

Close the PR #64 security-review LOW: every harness runs as PID 1 under uid 10001, the same uid as the
oracle child, and stays dumpable. The child can open `/proc/1/fd/1`, write a forged result line on the
container's stdout, then kill PID 1 with a signal whose runtime handler exits (Go: SIGTERM). `parseResult`
takes the last non-empty line, so the forged line becomes the result. Reproduced on the Go image.

## Threat model

- **Attack stopped:** oracle code (Python, Node, Ruby, Rails, Go; SQL for Postgres) writing a line on the
  container's stdout other than through the harness's own pipes, or ending PID 1 with a catchable signal.
- **Acceptance boundary:** the forge probe gets `EACCES` opening `/proc/1/fd/1`, PID 1 survives the probe's
  signals, and the run reports the probe's own honest value.
- **Out of scope:** a kernel or Docker escape; the oracle crashing PID 1 into a `RunnerFailure`
  (it lies only about itself, and the run carries no forged value).
- **Severity ceiling:** LOW was the original rating; the fix closes it, residuals are LOW.

## Design

- **Non-dumpable PID 1.** For a non-dumpable process `ptrace_may_access` denies a caller without
  `CAP_SYS_PTRACE`, so the oracle cannot open `/proc/1/fd/*` or `/proc/1/mem`. Go, Python, and Ruby call `prctl(PR_SET_DUMPABLE, 0)` first thing (Go raw syscall,
  Python `ctypes`, Ruby `Fiddle`). Node and bash have no prctl, so their images run PID 1 from a
  root-owned, execute-only (`0111`) copy of the interpreter: the kernel marks a process non-dumpable when
  it execs a binary it cannot read (`would_dump`, with `fs.suid_dumpable` 0 or 2). Those two harnesses
  check at startup that a separate `/bin/ls` of their own `/proc/<pid>/fd` fails, and fail closed with
  `RunnerFailure` otherwise. (On Docker Desktop's 6.10 kernel the `/proc/<pid>` owner does not change,
  so ownership is not a usable check.)
- **Signals.** A pid-namespace init ignores in-namespace signals left at `SIG_DFL`, so only runtime
  handlers that exit are a kill path. Each harness installs no-op handlers (not `SIG_IGN`, which the child
  would inherit across exec) for SIGHUP, SIGINT, SIGQUIT, SIGTERM, SIGUSR1, SIGUSR2. Go uses
  `signal.Notify` with no arguments, because its runtime also exits on SIGABRT, SIGILL, SIGTRAP, SIGSYS,
  and SIGSTKFLT sent by kill. Node runs PID 1 with `--disable-sigusr1` so SIGUSR1 cannot start the
  inspector on 127.0.0.1:9229, which would let the oracle run code inside the harness.
- **Postgres keeps its TERM trap:** `docker run` forwards the pipeline's timeout SIGTERM to PID 1 and the
  trap turns it into the `timeout` line. The oracle is SQL in a non-superuser role and cannot signal PID 1.
- **Rejected: a second uid for the oracle.** Switching uid needs `CAP_SETUID`, and the container runs with
  `--cap-drop ALL`, `--user 10001:10001`, and `no-new-privileges`. Adding the capability widens the sandbox.

## Acceptance criteria

- B-1 (python, node, ruby, rails): an oracle that opens `/proc/1/fd/1` for writing and writes a forged
  result line, then sends SIGHUP, SIGINT, SIGQUIT, SIGTERM, SIGUSR1, SIGUSR2 to PID 1, waits, and prints
  `denied` when the open failed or `opened` when it succeeded, yields `{outcome: 'value', value: 'denied'}`.
- B-2 (go): the same probe, sending every signal 1 to 31 to PID 1, yields `{outcome: 'value', value: 'denied'}`.
- B-3 (node): after the oracle sends SIGUSR1 to PID 1, nothing accepts a TCP connection on 127.0.0.1:9229.
- B-4 (postgres): while a Postgres oracle runs, a second process in the container as uid 10001
  (`docker exec`) cannot open `/proc/1/fd/1` for writing, and the run still reports the oracle's own value.
- B-5 (postgres): an oracle running `COPY (SELECT 'FORGED') TO '/proc/1/fd/1'` yields an exception, not
  the value `FORGED`. (Regression guard: passes before the fix because the oracle role cannot write server
  files.)

## Non-goals

Hiding `/proc` from the oracle, seccomp profiles, changing `buildDockerArgs`.
