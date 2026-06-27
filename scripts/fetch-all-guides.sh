#!/bin/bash
# Fetch all 62 ERG guides from NotebookLM, save raw output to individual files
OUTDIR="/tmp/erg-guides-raw"
mkdir -p "$OUTDIR"

for g in $(seq 111 172); do
  OUTFILE="$OUTDIR/guide_${g}.txt"
  if [ -f "$OUTFILE" ] && [ -s "$OUTFILE" ]; then
    echo "[SKIP] Guide $g already exists"
    continue
  fi
  echo -n "[$(date +%H:%M:%S)] Guide $g... "
  notebooklm ask "Give me the complete text of ERG Guide ${g}. Use labels TITLE:, HEALTH:, FIRE_OR_EXPLOSION:, PUBLIC_SAFETY:, PROTECTIVE_CLOTHING:, EVACUATION:, FIRE_RESPONSE:, SPILL_OR_LEAK:, FIRST_AID: — every bullet point, no summarizing." > "$OUTFILE" 2>&1
  if grep -q "HEALTH:" "$OUTFILE"; then
    echo "OK ($(wc -c < "$OUTFILE") bytes)"
  else
    echo "FAILED"
    rm -f "$OUTFILE"
  fi
  sleep 2
done

echo ""
echo "Done! $(ls "$OUTDIR"/guide_*.txt 2>/dev/null | wc -l) guides saved to $OUTDIR"
