# Oracle harness: reads {code, timeoutMs} JSON on stdin, writes one JSON result line.
# The harness stays PID 1 and never runs user code. A child in its own process group
# receives code on stdin and writes to pipes, so it cannot close or replace our result
# stream. The parent owns the timeout, output cap, and process-group cleanup.
require 'json'
require 'rbconfig'

OUTPUT_CAP_BYTES = 64 * 1024
STDERR_CAP_BYTES = 64 * 1024
MEMORY_LIMIT_BYTES = 200 * 1024 * 1024
FAILURE_EXIT_CODE = 70
EXCEPTION_MARKER = "\x00oracle-exception:"
VERSION = "Ruby #{RUBY_VERSION}"

CHILD_WRAPPER = <<~'SOURCE'
    code = STDIN.read
    begin
        eval(code, TOPLEVEL_BINDING, '<oracle>')
    rescue SystemExit
        # Like the Python runner, a normal exit preserves the printed value.
    rescue Exception => error
        STDERR.write("\n\x00oracle-exception:#{error.class.name}\n")
        STDERR.flush
        exit! 70
    end
    STDOUT.flush
SOURCE

def finish(result)
    STDOUT.write(JSON.generate(result.merge(runtimeVersion: VERSION)) + "\n")
    STDOUT.flush
    exit! 0
end

def kill_group(pid)
    begin
        Process.kill('KILL', -pid)
    rescue Errno::ESRCH
        # The group has already exited.
    end
    begin
        Process.kill('KILL', pid)
    rescue Errno::ESRCH
        # The child has already exited.
    end
end

def classify(status, out, err)
    if status.exitstatus == FAILURE_EXIT_CODE
        marker = err.lines.reverse.find { |line| line.start_with?(EXCEPTION_MARKER) }
        if marker
            exception_type = marker.delete_prefix(EXCEPTION_MARKER).chomp
            return { outcome: 'syntax-error' } if exception_type == 'SyntaxError'
            return { outcome: 'resource-limit' } if exception_type == 'NoMemoryError'
            return { outcome: 'exception', exceptionType: exception_type }
        end
    end
    return { outcome: 'resource-limit' } if status.signaled? || status.exitstatus == 137
    return { outcome: 'exception', exceptionType: 'RunnerFailure' } unless status.success?

    { outcome: 'value', value: out.force_encoding('UTF-8').scrub.delete_suffix("\n") }
end

payload = JSON.parse(STDIN.read)
deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + payload.fetch('timeoutMs', 5000) / 1000.0
input_read, input_write = IO.pipe
output_read, output_write = IO.pipe
error_read, error_write = IO.pipe
pid = Process.spawn(
    RbConfig.ruby, '-e', CHILD_WRAPPER,
    in: input_read, out: output_write, err: error_write,
    pgroup: true, rlimit_as: [MEMORY_LIMIT_BYTES, MEMORY_LIMIT_BYTES]
)
[input_read, output_write, error_write].each(&:close)
# Code travels on stdin, so the kernel's per-argument size limit does not apply.
begin
    input_write.write(payload.fetch('code'))
rescue Errno::EPIPE
    # An early child failure is classified from its exit status below.
ensure
    input_write.close
end
buffers = { output_read => ''.b, error_read => ''.b }
caps = { output_read => OUTPUT_CAP_BYTES, error_read => STDERR_CAP_BYTES }
streams = buffers.keys
status = nil

loop do
    remaining = deadline - Process.clock_gettime(Process::CLOCK_MONOTONIC)
    if remaining <= 0
        kill_group(pid)
        finish(outcome: 'timeout')
    end
    ready = IO.select(streams, nil, nil, [remaining, 0.05].min)
    (ready ? ready[0] : []).each do |stream|
        chunk = stream.read_nonblock(65536, exception: false)
        if chunk.nil?
            streams.delete(stream)
        elsif chunk != :wait_readable
            buffers[stream] << chunk
            if stream == output_read && buffers[stream].bytesize > OUTPUT_CAP_BYTES
                kill_group(pid)
                finish(outcome: 'resource-limit')
            end
            buffers[stream] = buffers[stream].byteslice(0, caps[stream])
        end
    end
    exited = Process.waitpid2(pid, Process::WNOHANG)
    if exited
        status = exited[1]
        break
    end
end

kill_group(pid)
# Only drain bytes already available: a detached grandchild may still hold a pipe.
buffers.each_key do |stream|
    while buffers[stream].bytesize <= caps[stream]
        chunk = stream.read_nonblock(65536, exception: false)
        break if chunk.nil? || chunk == :wait_readable
        buffers[stream] << chunk
    end
end
finish(outcome: 'resource-limit') if buffers[output_read].bytesize > OUTPUT_CAP_BYTES
finish(classify(status, buffers[output_read], buffers[error_read]))
