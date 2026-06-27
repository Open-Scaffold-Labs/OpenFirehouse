#!/usr/bin/env python3.11
"""
Extract full ERG 2024 guide text from NotebookLM and save as structured JSON.

Uses the notebooklm-py library directly (async API) to query in batches of 4 guides.
Parses structured label format and saves all 62 guides (111-172) to JSON.

Usage:
    python3.11 scripts/extract-erg-guides.py

Output:
    /tmp/erg-guides-parsed/all_guides.json
"""

import asyncio
import json
import os
import re
import sys
from pathlib import Path

from notebooklm import NotebookLMClient

# ERG Research notebook ID
NOTEBOOK_ID = "9830"

# All ERG guide numbers
ALL_GUIDES = list(range(111, 173))  # 111-172 inclusive

# Where raw files from previous session live
RAW_DIR = Path("/tmp/erg-guides-raw")

# Output directory
OUTPUT_DIR = Path("/tmp/erg-guides-parsed")


# Structured prompt for NotebookLM queries
BATCH_PROMPT_TEMPLATE = """For ERG 2024 Guides {guide_list}, provide the COMPLETE text for each section.
Use this EXACT format for each guide — no markdown bold, no citation brackets:

GUIDE_NUMBER: {first_guide}
TITLE: [full title]
HEALTH: [complete health hazards text]
FIRE_OR_EXPLOSION: [complete fire/explosion text]
PUBLIC_SAFETY: [complete public safety text]
PROTECTIVE_CLOTHING: [complete protective clothing text]
EVACUATION: [complete evacuation text]
FIRE_RESPONSE: [complete fire response text]
SPILL_OR_LEAK: [complete spill/leak response text]
FIRST_AID: [complete first aid text]

Repeat for each guide. Include ALL bullet points and sub-sections. Do not summarize or truncate."""


def parse_guide_text(raw_text: str) -> list[dict]:
    """Parse raw NotebookLM output into structured guide dicts."""
    guides = []
    
    # Split on GUIDE_NUMBER: markers
    chunks = re.split(r'(?=GUIDE_NUMBER:\s*\d+)', raw_text)
    
    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk:
            continue
        
        guide = {}
        
        # Extract guide number
        gn_match = re.match(r'GUIDE_NUMBER:\s*(\d+)', chunk)
        if not gn_match:
            continue
        guide['guide_number'] = int(gn_match.group(1))
        
        # Fields to extract in order
        fields = [
            ('TITLE', 'title'),
            ('HEALTH', 'health_hazards'),
            ('FIRE_OR_EXPLOSION', 'fire_explosion'),
            ('PUBLIC_SAFETY', 'public_safety'),
            ('PROTECTIVE_CLOTHING', 'protective_clothing'),
            ('EVACUATION', 'evacuation'),
            ('FIRE_RESPONSE', 'fire_response'),
            ('SPILL_OR_LEAK', 'spill_response'),
            ('FIRST_AID', 'first_aid'),
        ]
        
        # Build regex pattern: match LABEL: then everything until next LABEL: or end
        all_labels = '|'.join(f[0] for f in fields)
        
        for label, key in fields:
            pattern = rf'{label}:\s*(.*?)(?=(?:{all_labels}):|\Z)'
            match = re.search(pattern, chunk, re.DOTALL)
            if match:
                text = match.group(1).strip()
                # Clean up NotebookLM artifacts
                text = re.sub(r'\s*\[\d+(?:,\s*\d+)*\]\s*', ' ', text)  # Remove citation brackets [1], [1, 2]
                text = re.sub(r'\*\*', '', text)  # Remove markdown bold
                text = re.sub(r'\*\s', '• ', text)  # Convert markdown bullets to bullet char
                text = re.sub(r'\n{3,}', '\n\n', text)  # Collapse excessive newlines
                text = re.sub(r'\s*Conversation:\s*[a-f0-9-]+\s*\(turn\s*\d+\)\s*', '', text)  # Remove NotebookLM conversation IDs
                text = text.strip()
                guide[key] = text
            else:
                guide[key] = ''
        
        if guide.get('title'):
            guides.append(guide)
    
    return guides


def parse_individual_guide(raw_text: str, guide_number: int) -> dict | None:
    """Parse a single-guide raw file (older format with **LABEL:** markers)."""
    guide = {'guide_number': guide_number}
    
    fields = [
        ('TITLE', 'title'),
        ('HEALTH', 'health_hazards'),
        ('FIRE_OR_EXPLOSION', 'fire_explosion'),
        ('PUBLIC_SAFETY', 'public_safety'),
        ('PROTECTIVE_CLOTHING', 'protective_clothing'),
        ('EVACUATION', 'evacuation'),
        ('FIRE_RESPONSE', 'fire_response'),
        ('SPILL_OR_LEAK', 'spill_response'),
        ('FIRST_AID', 'first_aid'),
    ]
    
    all_labels = '|'.join(f[0] for f in fields)
    
    for label, key in fields:
        # Match both **LABEL:** and LABEL: formats
        pattern = rf'\*?\*?{label}:\*?\*?\s*(.*?)(?=\*?\*?(?:{all_labels}):\*?\*?|\Z)'
        match = re.search(pattern, raw_text, re.DOTALL)
        if match:
            text = match.group(1).strip()
            text = re.sub(r'\s*\[\d+(?:,\s*\d+)*\]\s*', ' ', text)
            text = re.sub(r'\*\*', '', text)
            text = re.sub(r'\*\s', '• ', text)
            text = re.sub(r'\n{3,}', '\n\n', text)
            text = re.sub(r'\s*Conversation:\s*[a-f0-9-]+\s*\(turn\s*\d+\)\s*', '', text)  # Remove NotebookLM conversation IDs
            text = text.strip()
            guide[key] = text
        else:
            guide[key] = ''
    
    return guide if guide.get('title') else None


def load_existing_raw_files() -> dict[int, dict]:
    """Load and parse all existing raw files from previous session."""
    parsed = {}
    
    if not RAW_DIR.exists():
        return parsed
    
    # Parse individual guide files (guide_111.txt through guide_128.txt)
    for f in sorted(RAW_DIR.glob("guide_*.txt")):
        match = re.match(r'guide_(\d+)\.txt', f.name)
        if match:
            gn = int(match.group(1))
            raw = f.read_text()
            if raw.strip():
                guide = parse_individual_guide(raw, gn)
                if guide:
                    parsed[gn] = guide
                    print(f"  Parsed {f.name} -> Guide {gn}: {guide.get('title', '???')}")
    
    # Parse batch files (batch_129_132.txt etc.)
    for f in sorted(RAW_DIR.glob("batch_*.txt")):
        match = re.match(r'batch_(\d+)_(\d+)\.txt', f.name)
        if match:
            raw = f.read_text()
            if not raw.strip():
                print(f"  Skipping empty {f.name}")
                continue
            guides = parse_guide_text(raw)
            for g in guides:
                gn = g['guide_number']
                parsed[gn] = g
                print(f"  Parsed {f.name} -> Guide {gn}: {g.get('title', '???')}")
    
    return parsed


async def fetch_missing_guides(missing: list[int]) -> dict[int, dict]:
    """Fetch missing guides from NotebookLM in batches of 4."""
    fetched = {}
    
    # Split into batches of 4
    batches = [missing[i:i+4] for i in range(0, len(missing), 4)]
    
    print(f"\nFetching {len(missing)} missing guides in {len(batches)} batches...")
    
    async with NotebookLMClient.from_storage() as client:
        for batch in batches:
            guide_list = ", ".join(str(g) for g in batch)
            prompt = BATCH_PROMPT_TEMPLATE.format(
                guide_list=guide_list,
                first_guide=batch[0]
            )
            
            print(f"\n  Querying NotebookLM for guides {guide_list}...")
            
            try:
                result = await client.chat.ask(NOTEBOOK_ID, prompt)
                response_text = result.text if hasattr(result, 'text') else str(result)
                
                # Save raw response
                RAW_DIR.mkdir(parents=True, exist_ok=True)
                fname = f"batch_{batch[0]}_{batch[-1]}.txt"
                (RAW_DIR / fname).write_text(response_text)
                print(f"  Saved raw response to {fname} ({len(response_text)} bytes)")
                
                # Parse the response
                guides = parse_guide_text(response_text)
                for g in guides:
                    gn = g['guide_number']
                    fetched[gn] = g
                    print(f"  Parsed Guide {gn}: {g.get('title', '???')}")
                
                # Check if we got all guides in this batch
                got = set(g['guide_number'] for g in guides)
                expected = set(batch)
                missing_from_batch = expected - got
                if missing_from_batch:
                    print(f"  WARNING: Missing guides from batch: {sorted(missing_from_batch)}")
                
                # Rate limit — be polite to NotebookLM
                await asyncio.sleep(3)
                
            except Exception as e:
                print(f"  ERROR fetching batch {guide_list}: {e}")
                print(f"  Auth may have expired. Re-run cookie extraction and retry.")
                break
    
    return fetched


async def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    print("=" * 60)
    print("ERG 2024 Guide Extraction — NotebookLM API")
    print("=" * 60)
    
    # Step 1: Load existing parsed guides
    print("\nStep 1: Loading existing raw files...")
    parsed = load_existing_raw_files()
    print(f"\nLoaded {len(parsed)} guides from existing files.")
    
    # Step 2: Identify missing guides
    have = set(parsed.keys())
    need = set(ALL_GUIDES) - have
    
    if need:
        print(f"\nStep 2: Missing {len(need)} guides: {sorted(need)}")
        fetched = await fetch_missing_guides(sorted(need))
        parsed.update(fetched)
        print(f"\nAfter fetching: {len(parsed)} total guides.")
    else:
        print("\nStep 2: All 62 guides already extracted!")
    
    # Step 3: Check completeness
    still_missing = set(ALL_GUIDES) - set(parsed.keys())
    if still_missing:
        print(f"\nWARNING: Still missing {len(still_missing)} guides: {sorted(still_missing)}")
        print("You may need to re-run after refreshing NotebookLM auth.")
    
    # Step 4: Save to JSON
    output_file = OUTPUT_DIR / "all_guides.json"
    # Sort by guide number
    all_guides = sorted(parsed.values(), key=lambda g: g['guide_number'])
    
    with open(output_file, 'w') as f:
        json.dump(all_guides, f, indent=2)
    
    print(f"\nStep 4: Saved {len(all_guides)} guides to {output_file}")
    print(f"File size: {output_file.stat().st_size:,} bytes")
    
    # Summary
    print("\n" + "=" * 60)
    print(f"SUMMARY: {len(all_guides)} of 62 guides extracted")
    for g in all_guides:
        title = g.get('title', '???')[:50]
        fields_filled = sum(1 for k in ['health_hazards', 'fire_explosion', 'public_safety',
                                          'protective_clothing', 'evacuation', 'fire_response',
                                          'spill_response', 'first_aid'] if g.get(k))
        print(f"  Guide {g['guide_number']:3d}: {title:<50s} [{fields_filled}/8 sections]")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
