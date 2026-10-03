"""Oracle harness: reads {code, timeoutMs} JSON on stdin, writes one JSON result line."""
import json
import os
import platform
import resource
import signal
import sys
import threading

OUTPUT_CAP_BYTES = 64 * 1024
MEMORY_LIMIT_BYTES = 200 * 1024 * 1024
REAL_STDOUT = sys.__stdout__
VERSION = "Python " + platform.python_version()


class OutputLimit(BaseException):
    pass


class Capture:
    def __init__(self):
        self.parts = []
        self.size = 0
        self.exceeded = False

    def write(self, text):
        self.size += len(text.encode("utf-8", "replace"))
        if self.size > OUTPUT_CAP_BYTES:
            self.exceeded = True
            raise OutputLimit()
        self.parts.append(text)
        return len(text)

    def flush(self):
        pass


def finish(result):
    result["runtimeVersion"] = VERSION
    REAL_STDOUT.write(json.dumps(result) + "\n")
    REAL_STDOUT.flush()
    os._exit(0)


def on_timeout(*_):
    finish({"outcome": "timeout"})


def main():
    payload = json.loads(sys.stdin.read())
    timer = threading.Timer(payload.get("timeoutMs", 5000) / 1000, on_timeout)
    timer.daemon = True
    timer.start()
    signal.signal(signal.SIGTERM, on_timeout)
    resource.setrlimit(resource.RLIMIT_AS, (MEMORY_LIMIT_BYTES, MEMORY_LIMIT_BYTES))

    try:
        compiled = compile(payload["code"], "<oracle>", "exec")
    except (SyntaxError, ValueError):
        finish({"outcome": "syntax-error"})

    capture = Capture()
    sys.stdout = capture
    failure = None
    try:
        exec(compiled, {"__name__": "__main__"})
    except OutputLimit:
        pass
    except SystemExit:
        pass
    except BaseException as error:
        failure = type(error).__name__
    sys.stdout = REAL_STDOUT

    if capture.exceeded:
        finish({"outcome": "resource-limit"})
    if failure is not None:
        finish({"outcome": "exception", "exceptionType": failure})
    text = "".join(capture.parts)
    if text.endswith("\n"):
        text = text[:-1]
    finish({"outcome": "value", "value": text})


main()
