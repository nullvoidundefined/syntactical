#!/bin/bash
# Oracle harness: reads {code, setupSql, timeoutMs} JSON on stdin, writes one JSON result line.
# Starts a throwaway Postgres server whose data lives on a tmpfs, runs the setup SQL, then
# reports the first column of the first row of the code's result.
set -u
export PATH="/usr/lib/postgresql/17/bin:$PATH"
WORK=/tmp/work
PGDATA_DIR=/pgdata/data
VALUE_CAP_BYTES=65536
mkdir -p "$WORK"

input=$(cat)
printf '%s' "$input" | jq -j '.setupSql // ""' > "$WORK/setup.sql"
printf '%s' "$input" | jq -j '.code' > "$WORK/code.sql"
timeout_s=$(printf '%s' "$input" | jq -r '(.timeoutMs // 5000) / 1000')

VERSION="PostgreSQL ?"

emit_other() {
    jq -cn --arg o "$1" --arg e "${2:-}" --arg r "$VERSION" \
        '{outcome:$o, runtimeVersion:$r} + (if $e != "" then {exceptionType:$e} else {} end)'
}

emit_value() {
    jq -cn --rawfile v "$1" --arg r "$VERSION" '{outcome:"value", value:$v, runtimeVersion:$r}'
}

report_error() {
    local state
    state=$(grep -o 'ERROR:  [0-9A-Z]\{5\}' "$WORK/err.txt" | head -n1 | awk '{print $2}')
    if [ "$state" = "42601" ]; then
        emit_other syntax-error
    else
        emit_other exception "${state:-RunnerFailure}"
    fi
}

work() {
    initdb -D "$PGDATA_DIR" -U runner -A trust --no-sync -E UTF8 --locale=C --wal-segsize=1 \
        > "$WORK/initdb.log" 2>&1 || { emit_other exception RunnerFailure; return; }
    pg_ctl -D "$PGDATA_DIR" -w -l "$WORK/pg.log" start -o "-c listen_addresses= \
-c unix_socket_directories=/tmp -c shared_buffers=16MB -c max_connections=8 -c fsync=off \
-c wal_level=minimal -c max_wal_senders=0 -c max_wal_size=32MB -c min_wal_size=2MB" \
        > "$WORK/pgctl.log" 2>&1 || { emit_other exception RunnerFailure; return; }
    local psql_base=(psql -X -q -At -h /tmp -U runner -d postgres -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate)
    local version
    version=$("${psql_base[@]}" -c 'SHOW server_version') || { emit_other exception RunnerFailure; return; }
    VERSION="PostgreSQL ${version%% *}"

    if [ -s "$WORK/setup.sql" ]; then
        "${psql_base[@]}" -f "$WORK/setup.sql" > /dev/null 2> "$WORK/err.txt" || { report_error; return; }
    fi
    "${psql_base[@]}" -F $'\x1f' -R $'\x1e' -c "$(cat "$WORK/code.sql")" 2> "$WORK/err.txt" \
        | head -c 1048576 > "$WORK/out.txt"
    if [ "${PIPESTATUS[0]}" -ne 0 ]; then report_error; return; fi

    local data record
    data=$(cat "$WORK/out.txt")
    record=${data%%$'\x1e'*}
    printf '%s' "${record%%$'\x1f'*}" > "$WORK/value.txt"
    if [ "$(wc -c < "$WORK/value.txt")" -gt "$VALUE_CAP_BYTES" ]; then
        emit_other resource-limit
    else
        emit_value "$WORK/value.txt"
    fi
}

trap 'emit_other timeout; exit 0' TERM

work > "$WORK/result.json" &
worker=$!
( sleep "$timeout_s"; touch "$WORK/timed-out"; kill -9 "$worker" 2> /dev/null ) &
timer=$!
wait "$worker"
kill "$timer" 2> /dev/null

if [ -s "$WORK/result.json" ]; then
    cat "$WORK/result.json"
elif [ -e "$WORK/timed-out" ]; then
    emit_other timeout
else
    emit_other exception RunnerFailure
fi
exit 0
