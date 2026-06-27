#!/usr/bin/env python3.11
"""
Update fs_hazmat_guides in local PostgreSQL with full ERG 2024 text from JSON.

Reads /tmp/erg-guides-parsed/all_guides.json (produced by extract-erg-guides.py)
and runs UPDATE statements for all 62 guides.

Usage:
    python3.11 scripts/update-guides-from-json.py
"""

import json
import psycopg2

DB_CONN = "postgresql://matthewlavin@localhost:5432/freestation"
JSON_PATH = "/tmp/erg-guides-parsed/all_guides.json"

def main():
    with open(JSON_PATH) as f:
        guides = json.load(f)
    
    print(f"Loaded {len(guides)} guides from JSON")
    
    conn = psycopg2.connect(DB_CONN)
    cur = conn.cursor()
    
    updated = 0
    skipped = 0
    
    for g in guides:
        gn = g['guide_number']
        
        # Check guide exists in DB
        cur.execute("SELECT guide_number FROM fs_hazmat_guides WHERE guide_number = %s", (gn,))
        if not cur.fetchone():
            print(f"  WARNING: Guide {gn} not found in DB — skipping")
            skipped += 1
            continue
        
        cur.execute("""
            UPDATE fs_hazmat_guides SET
                title = %s,
                health_hazards = %s,
                fire_explosion = %s,
                public_safety = %s,
                protective_clothing = %s,
                evacuation = %s,
                fire_response = %s,
                spill_response = %s,
                first_aid = %s
            WHERE guide_number = %s
        """, (
            g.get('title', ''),
            g.get('health_hazards', ''),
            g.get('fire_explosion', ''),
            g.get('public_safety', ''),
            g.get('protective_clothing', ''),
            g.get('evacuation', ''),
            g.get('fire_response', ''),
            g.get('spill_response', ''),
            g.get('first_aid', ''),
            gn,
        ))
        updated += 1
    
    conn.commit()
    
    # Verify
    cur.execute("""
        SELECT guide_number, title,
               LENGTH(COALESCE(health_hazards,'')) + LENGTH(COALESCE(fire_explosion,'')) +
               LENGTH(COALESCE(public_safety,'')) + LENGTH(COALESCE(protective_clothing,'')) +
               LENGTH(COALESCE(evacuation,'')) + LENGTH(COALESCE(fire_response,'')) +
               LENGTH(COALESCE(spill_response,'')) + LENGTH(COALESCE(first_aid,'')) as total_chars
        FROM fs_hazmat_guides ORDER BY guide_number
    """)
    rows = cur.fetchall()
    
    print(f"\nUpdated {updated} guides, skipped {skipped}")
    print(f"\nVerification — all {len(rows)} guides in DB:")
    total = 0
    for gn, title, chars in rows:
        print(f"  Guide {gn:3d}: {chars:5d} chars — {title[:50]}")
        total += chars
    print(f"\nTotal chars in DB: {total:,}")
    
    cur.close()
    conn.close()
    print("\nDone!")


if __name__ == "__main__":
    main()
