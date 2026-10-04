// Runs during the image build (see Dockerfile), so a misclassifying harness never becomes
// an image. Covers the build and run failure paths that cannot be provoked from an oracle
// reliably: a compiler killed for memory, a full /work, a broken toolchain.
package main

import "testing"

func TestClassifyBuildFailure(t *testing.T) {
	cases := []struct {
		name   string
		stderr string
		want   result
	}{
		{"type error", "# command-line-arguments\n./main.go:2:14: declared and not used: x\n", result{Outcome: "syntax-error"}},
		{"parse error", "# command-line-arguments\n./main.go:3:27: syntax error: unexpected }\n", result{Outcome: "syntax-error"}},
		{"absolute source path", "/work/main.go:1:1: expected 'package', found 'EOF'\n", result{Outcome: "syntax-error"}},
		{"compiler killed", "# command-line-arguments\ngo build command-line-arguments: /usr/local/go/pkg/tool/linux_arm64/compile: signal: killed\n", result{Outcome: "resource-limit"}},
		{"disk full", "go: writing output: write /work/oracle: no space left on device\n", result{Outcome: "resource-limit"}},
		{"out of memory", "fatal error: runtime: out of memory\n", result{Outcome: "resource-limit"}},
		{"toolchain failure", "go: cannot find GOROOT directory: /usr/local/go\n", result{Outcome: "exception", ExceptionType: "RunnerFailure"}},
	}
	for _, c := range cases {
		if got := classifyBuildFailure(c.stderr); got != c.want {
			t.Errorf("%s: got %+v, want %+v", c.name, got, c.want)
		}
	}
}

func TestClassifyRunFailure(t *testing.T) {
	cases := []struct {
		name   string
		stderr string
		want   string
	}{
		{"panic", "panic: boom\n\ngoroutine 1 [running]:\nmain.main()\n", "panic"},
		{"panic after unterminated stderr", "starting panic: boom\n\ngoroutine 1 [running]:\n", "panic"},
		{"runtime error", "panic: runtime error: index out of range [3] with length 3\n\ngoroutine 1 [running]:\n", "panic"},
		{"deadlock", "fatal error: all goroutines are asleep - deadlock!\n\ngoroutine 1 [select (no cases)]:\n", "deadlock"},
		{"other fatal error", "fatal error: concurrent map writes\n\ngoroutine 5 [running]:\n", "fatal error"},
		{"plain exit", "", "exit"},
	}
	for _, c := range cases {
		if got := classifyFailure(c.stderr); got.ExceptionType != c.want {
			t.Errorf("%s: got %+v, want exceptionType %q", c.name, got, c.want)
		}
	}
}
