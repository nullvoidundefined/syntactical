// Oracle harness: reads {code, timeoutMs} JSON on stdin, writes one JSON result line.
//
// The harness stays PID 1 and never runs user code itself. It writes the oracle to /work,
// builds it with the image's toolchain, and runs the binary as a child in its own process
// group whose stdout and stderr are pipes the harness reads, so nothing the child writes or
// closes can forge or suppress the result line on the harness's own stdout. One deadline
// covers the build and the run; past it the harness SIGKILLs the process group.
//
// The image ships a build cache warmed for the standard library. Go needs a writable cache,
// so each run copies it into /work, the only mount that allows exec.
package main

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
)

const (
	outputCapBytes   = 64 * 1024
	stderrCapBytes   = 64 * 1024
	defaultTimeoutMs = 5000
	workDir          = "/work"
	warmCacheDir     = "/gocache"
)

type payload struct {
	Code      string `json:"code"`
	TimeoutMs int    `json:"timeoutMs"`
}

type result struct {
	Outcome        string  `json:"outcome"`
	Value          *string `json:"value,omitempty"`
	ExceptionType  string  `json:"exceptionType,omitempty"`
	RuntimeVersion string  `json:"runtimeVersion"`
}

var version = "Go " + strings.TrimPrefix(runtime.Version(), "go")

func finish(r result) {
	r.RuntimeVersion = version
	line, _ := json.Marshal(r)
	os.Stdout.Write(append(line, '\n'))
	os.Exit(0)
}

func runnerFailure() {
	finish(result{Outcome: "exception", ExceptionType: "RunnerFailure"})
}

// cappedBuffer keeps at most limit bytes and records whether more arrived. onOverflow, when
// set, runs once at the first byte past the cap.
type cappedBuffer struct {
	data       bytes.Buffer
	limit      int
	overflow   bool
	onOverflow func()
}

func (b *cappedBuffer) Write(p []byte) (int, error) {
	room := b.limit - b.data.Len()
	if len(p) > room {
		if !b.overflow && b.onOverflow != nil {
			b.onOverflow()
		}
		b.overflow = true
		if room > 0 {
			b.data.Write(p[:room])
		}
		return len(p), nil
	}
	return b.data.Write(p)
}

func killGroup(cmd *exec.Cmd) {
	if cmd.Process != nil {
		syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		cmd.Process.Kill()
	}
}

// start runs name in its own process group with piped output. The returned wait function
// reaps the process and then kills the group, so a detached grandchild still holding a pipe
// cannot keep the harness waiting for EOF.
func start(deadline time.Time, stdout, stderr *cappedBuffer, env []string, name string, args ...string) (*os.ProcessState, bool) {
	cmd := exec.Command(name, args...)
	cmd.Dir = workDir
	cmd.Env = env
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	outPipe, err := cmd.StdoutPipe()
	if err != nil {
		runnerFailure()
	}
	errPipe, err := cmd.StderrPipe()
	if err != nil {
		runnerFailure()
	}
	if err := cmd.Start(); err != nil {
		runnerFailure()
	}
	// Output past the cap ends the run at once rather than at the deadline.
	stdout.onOverflow = func() { killGroup(cmd) }
	copied := make(chan struct{}, 2)
	go func() { io.Copy(stdout, outPipe); copied <- struct{}{} }()
	go func() { io.Copy(stderr, errPipe); copied <- struct{}{} }()

	exited := make(chan *os.ProcessState, 1)
	go func() {
		state, _ := cmd.Process.Wait()
		exited <- state
	}()
	timer := time.NewTimer(time.Until(deadline))
	defer timer.Stop()
	select {
	case state := <-exited:
		killGroup(cmd)
		// The group is dead, so both pipes reach EOF; wait briefly for the copies to drain.
		drain := time.NewTimer(500 * time.Millisecond)
		defer drain.Stop()
		for i := 0; i < 2; i++ {
			select {
			case <-copied:
			case <-drain.C:
				i = 2
			}
		}
		return state, false
	case <-timer.C:
		killGroup(cmd)
		return nil, true
	}
}

func copyTree(src, dst string) error {
	return filepath.WalkDir(src, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, path)
		target := filepath.Join(dst, rel)
		if entry.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(target, data, 0o644)
	})
}

func signaled(state *os.ProcessState) bool {
	status, ok := state.Sys().(syscall.WaitStatus)
	return ok && status.Signaled()
}

func classifyFailure(stderr string) result {
	switch {
	case strings.Contains(stderr, "fatal error: all goroutines are asleep - deadlock!"):
		return result{Outcome: "exception", ExceptionType: "deadlock"}
	case strings.Contains(stderr, "fatal error: runtime: out of memory"),
		strings.Contains(stderr, "runtime: cannot allocate memory"):
		return result{Outcome: "resource-limit"}
	case strings.HasPrefix(stderr, "panic: ") || strings.Contains(stderr, "\npanic: "):
		return result{Outcome: "exception", ExceptionType: "panic"}
	case strings.HasPrefix(stderr, "fatal error: ") || strings.Contains(stderr, "\nfatal error: "):
		return result{Outcome: "exception", ExceptionType: "fatal error"}
	default:
		return result{Outcome: "exception", ExceptionType: "exit"}
	}
}

func main() {
	var input payload
	if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil {
		runnerFailure()
	}
	timeoutMs := input.TimeoutMs
	if timeoutMs <= 0 {
		timeoutMs = defaultTimeoutMs
	}
	deadline := time.Now().Add(time.Duration(timeoutMs) * time.Millisecond)

	cacheDir := filepath.Join(workDir, "cache")
	tmpDir := filepath.Join(workDir, "tmp")
	source := filepath.Join(workDir, "main.go")
	binary := filepath.Join(workDir, "oracle")
	if copyTree(warmCacheDir, cacheDir) != nil || os.MkdirAll(tmpDir, 0o755) != nil {
		runnerFailure()
	}
	if os.WriteFile(source, []byte(input.Code), 0o644) != nil {
		runnerFailure()
	}

	buildEnv := []string{
		"PATH=/usr/local/go/bin:/usr/bin:/bin",
		"HOME=" + workDir,
		"GOCACHE=" + cacheDir,
		"GOTMPDIR=" + tmpDir,
		"GOPATH=" + filepath.Join(workDir, "gopath"),
		"GOTOOLCHAIN=local",
		"GOPROXY=off",
		"GOFLAGS=-mod=mod",
		"CGO_ENABLED=0",
		"GOMAXPROCS=2",
	}
	buildOut := &cappedBuffer{limit: stderrCapBytes}
	buildErr := &cappedBuffer{limit: stderrCapBytes}
	state, timedOut := start(deadline, buildOut, buildErr, buildEnv, "go", "build", "-p", "1", "-o", binary, source)
	if timedOut {
		finish(result{Outcome: "timeout"})
	}
	if !state.Success() {
		if signaled(state) {
			finish(result{Outcome: "resource-limit"})
		}
		// Parse and type errors both stop the build; the oracle never ran.
		finish(result{Outcome: "syntax-error"})
	}

	stdout := &cappedBuffer{limit: outputCapBytes}
	stderr := &cappedBuffer{limit: stderrCapBytes}
	runEnv := []string{"HOME=" + workDir, "TMPDIR=/tmp", "GOMAXPROCS=2"}
	state, timedOut = start(deadline, stdout, stderr, runEnv, binary)
	if timedOut {
		finish(result{Outcome: "timeout"})
	}
	if stdout.overflow {
		finish(result{Outcome: "resource-limit"})
	}
	if signaled(state) {
		finish(result{Outcome: "resource-limit"})
	}
	if !state.Success() {
		finish(classifyFailure(stderr.data.String()))
	}
	value := strings.TrimSuffix(stdout.data.String(), "\n")
	finish(result{Outcome: "value", Value: &value})
}
