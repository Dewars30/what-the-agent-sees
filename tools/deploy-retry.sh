#!/bin/bash
# Retry a Synteq Apps deploy until it lands. Their builder intermittently fails
# at the registry auth step; the same bundle succeeds on a later attempt.
set -u
DIR="$1"; SLUG="$2"; TRIES="${3:-8}"; SYNT="/Users/td/Documents/Aside/Projects/Synteq_Hack/_tools/node_modules/.bin/synteq"
cd "$DIR" || exit 1
for i in $(seq 1 "$TRIES"); do
  OUT=$("$SYNT" deploy 2>&1)
  STATUS=$(printf '%s' "$OUT" | python3 -c "import json,sys
try:
  d=json.loads(sys.stdin.read()); print(d.get('status','?'))
except Exception: print('parse-error')" 2>/dev/null)
  echo "[$SLUG] attempt $i -> $STATUS"
  if [ "$STATUS" = "deployed" ] || [ "$STATUS" = "live" ]; then exit 0; fi
  sleep 20
done
echo "[$SLUG] gave up after $TRIES attempts"
exit 1
