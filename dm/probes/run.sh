#!/usr/bin/env bash
# Run one probe page in headless Chrome and print its report.
#
#   probes/run.sh storage        -> probes/storage.html
#
# The traps this works around, all paid for at least twice:
#   --dump-dom fires at the load event, so it only ever shows the empty shell;
#   --virtual-time-budget advances timers but races real work and hangs;
#   headless Chrome does not exit on its own, so it is killed by the clock;
#   and window.open() from a probe has no user gesture behind it, so the popup
#   blocker eats the second window unless it is turned off here.
# A probe therefore reports by console.log, and this reads it back off stderr.
set -u
here=$(cd "$(dirname "$0")" && pwd)
name=${1:?usage: run.sh <probe-name> [seconds]}
secs=${2:-25}
port=${DM_PORT:-8421}
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
log=$(mktemp)
profile=$(mktemp -d)

curl -sf "http://127.0.0.1:$port/api/ping" >/dev/null || {
  echo "no server on $port — start it with: python3 dm2/server.py --no-browser --dev"; exit 2; }

"$chrome" --headless=new --disable-gpu --no-sandbox --enable-logging=stderr \
  --disable-popup-blocking \
  --user-data-dir="$profile" "http://127.0.0.1:$port/probes/$name.html" >"$log" 2>&1 &
pid=$!
sentinel=$(echo "$name" | tr 'a-z' 'A-Z')
for _ in $(seq 1 "$secs"); do
  grep -q "PROBE:$sentinel" "$log" && break
  sleep 1
done
kill $pid 2>/dev/null
wait $pid 2>/dev/null

if ! grep -q "PROBE:$sentinel" "$log"; then
  echo "PROBE DID NOT REPORT — it hung, or it threw before reporting:"
  grep -iE "Uncaught|SEVERE|CONSOLE" "$log" | head -20
  rm -rf "$profile"; exit 1
fi
grep -o "PROBE:$sentinel .*" "$log" | head -1 | sed "s/^PROBE:$sentinel //" \
  | python3 -c '
import sys, json
raw = sys.stdin.read()
d = json.loads(raw[:raw.rindex("}") + 1])
print("%d/%d checks passed" % (d["total"] - d["failed"], d["total"]))
for f in d["failures"]:
    print(" x", f["name"])
    print("   got: ", json.dumps(f.get("got"), ensure_ascii=False))
    print("   want:", json.dumps(f.get("want"), ensure_ascii=False))
sys.exit(1 if d["failed"] else 0)'
code=$?
rm -rf "$profile" "$log"
exit $code
