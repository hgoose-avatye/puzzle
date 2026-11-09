#!/bin/sh
# Runs scripts/pick-seeds-curve.ts over 1-180 in parallel parts and merges them (a full pick takes about an hour on
# one core: the knot search grades hundreds of boards per seed). Usage: sh scripts/pick-all.sh [parts=8] [candidates=6]
set -e
PARTS=${1:-8}
CANDS=${2:-6}
TSX=${TSX:-npx tsx}
DIR=docs/sim/picks
mkdir -p "$DIR"
STEP=$(( (180 + PARTS - 1) / PARTS ))
FILES=""
for i in $(seq 0 $((PARTS - 1))); do
  FIRST=$((i * STEP + 1)); LAST=$(( (i + 1) * STEP )); [ "$LAST" -gt 180 ] && LAST=180
  [ "$FIRST" -gt 180 ] && break
  OUT="$DIR/part-$i.json"; FILES="$FILES $OUT"
  $TSX scripts/pick-seeds-curve.ts "$FIRST" "$LAST" "$CANDS" "$OUT" 2> "$DIR/part-$i.log" &
done
wait
$TSX scripts/pick-seeds-curve.ts merge $FILES
