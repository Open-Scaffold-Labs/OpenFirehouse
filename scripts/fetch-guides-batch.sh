#!/bin/zsh
# Fetch remaining ERG guides in batches of 4 via NotebookLM
OUTDIR="/tmp/erg-guides-raw"
mkdir -p "$OUTDIR"

# Remaining: 133-172 (111-128 done individually, 129-132 done as batch)
batches=(
  "133,134,135,136"
  "137,138,139,140"
  "141,142,143,144"
  "145,146,147,148"
  "149,150,151,152"
  "153,154,155,156"
  "157,158,159,160"
  "161,162,163,164"
  "165,166,167,168"
  "169,170,171,172"
)

for batch in "${batches[@]}"; do
  first=${batch%%,*}
  last=${batch##*,}
  outfile="$OUTDIR/batch_${first}_${last}.txt"

  if [[ -f "$outfile" ]] && [[ $(wc -c < "$outfile") -gt 1000 ]]; then
    echo "[SKIP] Batch ${first}-${last} already exists ($(wc -c < "$outfile") bytes)"
    continue
  fi

  echo -n "[$(date +%H:%M:%S)] Guides ${batch}... "
  notebooklm ask "Give me the COMPLETE text of ERG Guides ${batch}. For EACH guide, use these exact labels on separate lines: GUIDE_NUMBER:, TITLE:, HEALTH:, FIRE_OR_EXPLOSION:, PUBLIC_SAFETY:, PROTECTIVE_CLOTHING:, EVACUATION:, FIRE_RESPONSE:, SPILL_OR_LEAK:, FIRST_AID: — every bullet point from the ERG, no summarizing." > "$outfile" 2>&1

  count=$(grep -c "GUIDE_NUMBER:" "$outfile" 2>/dev/null)
  bytes=$(wc -c < "$outfile")
  if [[ $count -ge 3 ]]; then
    echo "OK ($count guides, $bytes bytes)"
  elif [[ $bytes -lt 500 ]]; then
    echo "AUTH FAILED — run 'notebooklm login' to re-authenticate, then re-run this script."
    exit 1
    notebooklm use 9830 > /dev/null 2>&1
    rm -f "$outfile"
    echo "  Retrying..."
    notebooklm ask "Give me the COMPLETE text of ERG Guides ${batch}. For EACH guide, use these exact labels on separate lines: GUIDE_NUMBER:, TITLE:, HEALTH:, FIRE_OR_EXPLOSION:, PUBLIC_SAFETY:, PROTECTIVE_CLOTHING:, EVACUATION:, FIRE_RESPONSE:, SPILL_OR_LEAK:, FIRST_AID: — every bullet point from the ERG, no summarizing." > "$outfile" 2>&1
    count=$(grep -c "GUIDE_NUMBER:" "$outfile" 2>/dev/null)
    echo "  Retry result: $count guides"
  else
    echo "PARTIAL ($count guides, $bytes bytes)"
  fi
  sleep 3
done

echo ""
echo "Done!"
ls -la "$OUTDIR"/batch_*.txt 2>/dev/null
