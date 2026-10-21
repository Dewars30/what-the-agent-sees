#!/bin/bash
# Deploy a Synteq app repeatedly until its /healthz answers 200.
# Their builder intermittently fails at the registry auth step; the same bundle
# usually succeeds on a later attempt.
set -u
DIR="$1"; SLUG="$2"; TRIES="${3:-8}"
SYNT="/Users/td/Documents/Aside/Projects/Synteq_Hack/_tools/node_modules/.bin/synteq"
cd "$DIR" || exit 1
for i in $(seq 1 "$TRIES"); do
  echo "[$SLUG] attempt $i"
  "$SYNT" deploy > /tmp/deploy-$SLUG-$i.log 2>&1
  sleep 6
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 12 "https://$SLUG.synteq.app/healthz")
  echo "[$SLUG] healthz $CODE"
  if [ "$CODE" = "200" ]; then echo "[$SLUG] LIVE"; exit 0; fi
  grep -o '"failureReason"[^,]*' /tmp/deploy-$SLUG-$i.log | head -c 160; echo
  sleep 15
done
echo "[$SLUG] not live after $TRIES attempts"
exit 1
