"""Oracle harness: reads {code, timeoutMs} JSON on stdin, writes one JSON result line.

The harness stays PID 1 and never runs user code. The oracle runs in a child process whose
stdout and stderr are pipes the harness reads, so nothing the child writes or closes can
forge or suppress the result line the harness writes to its own stdout. The harness owns the
timeout and SIGKILLs the child's process group.
"""
import json
import os
import platform
import resource
import selectors
import signal
import subprocess
import sys
import time

OUTPUT_CAP_BYTES = 64 * 1024
STDERR_CAP_BYTES = 64 * 1024
MEMORY_LIMIT_BYTES = 200 * 1024 * 1024
# Exit status of a process killed by SIGKILL (128 + 9), as the OOM killer does.
SIGKILL_EXIT_STATUS = 137
VERSION = "Python " + platform.python_version()
EXCEPTION_MARKER = "\x00oracle-exception:"
SYNTAX_MARKER = "\x00oracle-syntax-error"
FAILURE_EXIT_CODE = 70

CHILD_WRAPPER = """
import os, sys
code = sys.argv[1]
try:
    compiled = compile(code, "<oracle>", "exec")
except (SyntaxError, ValueError):
    sys.stderr.write("\\n%s\\n" % SYNTAX_MARKER)
    sys.stderr.flush()
    os._exit(FAILURE_EXIT_CODE)
try:
    exec(compiled, {"__name__": "__main__"})
except SystemExit:
    pass
except BaseException as error:
    sys.stderr.write("\\n%s%s\\n" % (EXCEPTION_MARKER, type(error).__name__))
    sys.stderr.flush()
    os._exit(FAILURE_EXIT_CODE)
sys.stdout.flush()
""".replace("SYNTAX_MARKER", repr(SYNTAX_MARKER)).replace(
    "EXCEPTION_MARKER", repr(EXCEPTION_MARKER)
).replace("FAILURE_EXIT_CODE", str(FAILURE_EXIT_CODE))


def limit_memory():
    resource.setrlimit(resource.RLIMIT_AS, (MEMORY_LIMIT_BYTES, MEMORY_LIMIT_BYTES))


def finish(result):
    result["runtimeVersion"] = VERSION
    sys.stdout.write(json.dumps(result) + "\n")
    sys.stdout.flush()
    os._exit(0)


def kill_group(child):
    try:
        os.killpg(child.pid, signal.SIGKILL)
    except OSError:
        pass
    try:
        child.kill()
    except OSError:
        pass


def classify(child, out, err):
    stderr_text = err.decode("utf-8", "replace")
    if child.returncode == FAILURE_EXIT_CODE:
        if SYNTAX_MARKER in stderr_text:
            return {"outcome": "syntax-error"}
        for line in reversed(stderr_text.splitlines()):
            if line.startswith(EXCEPTION_MARKER):
                exception_type = line[len(EXCEPTION_MARKER):]
                if exception_type == "MemoryError":
                    return {"outcome": "resource-limit"}
                return {"outcome": "exception", "exceptionType": exception_type}
    if child.returncode < 0 or child.returncode == SIGKILL_EXIT_STATUS:
        return {"outcome": "resource-limit"}
    if child.returncode != 0:
        return {"outcome": "exception", "exceptionType": "RunnerFailure"}
    text = out.decode("utf-8", "replace")
    if text.endswith("\n"):
        text = text[:-1]
    return {"outcome": "value", "value": text}


def main():
    payload = json.loads(sys.stdin.read())
    deadline = time.monotonic() + payload.get("timeoutMs", 5000) / 1000
    child = subprocess.Popen(
        [sys.executable, "-c", CHILD_WRAPPER, payload["code"]],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        preexec_fn=limit_memory,
        start_new_session=True,
    )
    buffers = {child.stdout: bytearray(), child.stderr: bytearray()}
    caps = {child.stdout: OUTPUT_CAP_BYTES, child.stderr: STDERR_CAP_BYTES}
    selector = selectors.DefaultSelector()
    for stream in buffers:
        os.set_blocking(stream.fileno(), False)
        selector.register(stream, selectors.EVENT_READ)

    while selector.get_map():
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            kill_group(child)
            finish({"outcome": "timeout"})
        for key, _ in selector.select(min(remaining, 0.05)):
            stream = key.fileobj
            chunk = os.read(stream.fileno(), 65536)
            if not chunk:
                selector.unregister(stream)
                continue
            buffers[stream].extend(chunk)
            if stream is child.stdout and len(buffers[stream]) > caps[stream]:
                kill_group(child)
                finish({"outcome": "resource-limit"})
            if len(buffers[stream]) > caps[stream]:
                del buffers[stream][caps[stream]:]
        if child.poll() is not None:
            # The child is gone; anything it left in the pipes is already readable.
            for stream in list(selector.get_map().values()):
                selector.unregister(stream.fileobj)
            break

    kill_group(child)
    child.wait()
    for stream in (child.stdout, child.stderr):
        while len(buffers[stream]) <= caps[stream]:
            try:
                data = os.read(stream.fileno(), 65536)
            except OSError:
                break
            if not data:
                break
            buffers[stream].extend(data)
    if len(buffers[child.stdout]) > OUTPUT_CAP_BYTES:
        finish({"outcome": "resource-limit"})
    finish(classify(child, bytes(buffers[child.stdout]), bytes(buffers[child.stderr])))


main()
