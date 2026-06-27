'use strict';
const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// AI provider calls go through the ONE guarded helper (utils/aiClient): budget
// check before, real token usage after, centralized model + key-safe errors.
// Prompt-injection guarding (promptGuard) is applied at each call site.
const { callAI, sendAIError } = require('../utils/aiClient');
const { guardedSystemPrompt, guardedUserPrompt } = require('../utils/promptGuard');

// ── Target table schemas (what AI maps to) ──────────────────────────────────
const TARGET_SCHEMAS = {
  members: {
    label: 'Member Roster',
    table: 'members',
    columns: [
      { name: 'name', type: 'TEXT', required: true, description: 'Full name' },
      { name: 'rank', type: 'TEXT', description: 'Rank/title (e.g. Firefighter I, Captain)' },
      { name: 'role', type: 'TEXT', description: 'System role: member, officer, or chief' },
      { name: 'status', type: 'TEXT', description: 'Active, Inactive, Leave, etc.' },
      { name: 'email', type: 'TEXT', description: 'Email address' },
      { name: 'phone', type: 'TEXT', description: 'Phone number' },
      { name: 'joined', type: 'TEXT', description: 'Date joined (YYYY-MM-DD)' },
      { name: 'memberNumber', type: 'TEXT', description: 'Badge/member number' },
      { name: 'employment_type', type: 'TEXT', description: 'volunteer, career, part-time, per-diem' },
      { name: 'certifications', type: 'TEXT[]', description: 'Array of certification names' },
    ],
  },
  incidents: {
    label: 'Incident Log',
    table: 'incidents',
    columns: [
      { name: '"incidentNumber"', type: 'TEXT', required: true, description: 'Incident/run number' },
      { name: 'date', type: 'TEXT', required: true, description: 'Date (YYYY-MM-DD)' },
      { name: 'time', type: 'TEXT', description: 'Dispatch time' },
      { name: 'type', type: 'TEXT', description: 'Incident type (Structure Fire, EMS, MVA, etc.)' },
      { name: 'address', type: 'TEXT', description: 'Incident address/location' },
      { name: '"alarmLevel"', type: 'TEXT', description: 'Alarm level (1st Alarm, 2nd Alarm, etc.)' },
      { name: 'disposition', type: 'TEXT', description: 'Outcome/disposition' },
      { name: 'description', type: 'TEXT', description: 'Narrative/description' },
      { name: '"dispatchTime"', type: 'TEXT', description: 'Dispatch timestamp' },
      { name: '"clearTime"', type: 'TEXT', description: 'Clear timestamp' },
    ],
  },
  training: {
    label: 'Training Records',
    table: 'training',
    columns: [
      { name: '"memberName"', type: 'TEXT', required: true, description: 'Member name' },
      { name: '"courseName"', type: 'TEXT', required: true, description: 'Course/class name' },
      { name: 'type', type: 'TEXT', description: 'Type: Classroom, Practical, Online, etc.' },
      { name: 'status', type: 'TEXT', description: 'Completed, In Progress, Scheduled' },
      { name: '"completedDate"', type: 'TEXT', description: 'Completion date (YYYY-MM-DD)' },
      { name: '"expiresDate"', type: 'TEXT', description: 'Expiration date (YYYY-MM-DD)' },
      { name: 'hours', type: 'NUMERIC', description: 'Credit hours' },
      { name: 'instructor', type: 'TEXT', description: 'Instructor name' },
      { name: 'location', type: 'TEXT', description: 'Training location' },
    ],
  },
  apparatus: {
    label: 'Apparatus / Fleet',
    table: 'apparatus',
    columns: [
      { name: 'designation', type: 'TEXT', required: true, description: 'Unit designation (Engine 1, Ladder 2)' },
      { name: 'type', type: 'TEXT', description: 'Engine, Ladder, Rescue, Tanker, etc.' },
      { name: 'year', type: 'INTEGER', description: 'Model year' },
      { name: 'make', type: 'TEXT', description: 'Manufacturer' },
      { name: 'model', type: 'TEXT', description: 'Model name' },
      { name: 'status', type: 'TEXT', description: 'In Service, Out of Service, Reserve' },
      { name: 'vin', type: 'TEXT', description: 'VIN number' },
      { name: 'mileage', type: 'INTEGER', description: 'Current mileage/hours' },
      { name: '"lastService"', type: 'TEXT', description: 'Last service date (YYYY-MM-DD)' },
      { name: '"nextServiceDue"', type: 'TEXT', description: 'Next service due date' },
    ],
  },
  hydrants: {
    label: 'Hydrant Inventory',
    table: 'hydrants',
    columns: [
      { name: '"hydrantId"', type: 'TEXT', required: true, description: 'Hydrant ID / number' },
      { name: 'location', type: 'TEXT', description: 'Street address or cross-streets' },
      { name: 'type', type: 'TEXT', description: 'Wet barrel, Dry barrel, Standpipe, etc.' },
      { name: 'status', type: 'TEXT', description: 'In Service, Out of Service, Needs Repair' },
      { name: '"flowRate"', type: 'INTEGER', description: 'Flow rate in GPM' },
      { name: '"lastInspection"', type: 'TEXT', description: 'Last inspection date' },
      { name: '"numOutlets"', type: 'INTEGER', description: 'Number of outlets' },
    ],
  },
  qualifications: {
    label: 'Certifications / Qualifications',
    table: 'member_qualifications',
    columns: [
      { name: 'member_id', type: 'INTEGER', required: true, description: 'Member ID (integer)' },
      { name: 'cert_type', type: 'TEXT', required: true, description: 'Category: fire, ems, hazmat, driver, officer, rescue, nims, other' },
      { name: 'cert_name', type: 'TEXT', required: true, description: 'Certification name' },
      { name: 'issued_date', type: 'TEXT', description: 'Date issued (YYYY-MM-DD)' },
      { name: 'expiry_date', type: 'TEXT', description: 'Expiration date (YYYY-MM-DD)' },
      { name: 'issuing_authority', type: 'TEXT', description: 'Issuing organization' },
      { name: 'cert_number', type: 'TEXT', description: 'Certificate number' },
      { name: 'status', type: 'TEXT', description: 'active, expired, pending, revoked' },
    ],
  },
};

// ── POST /analyze — AI analyzes pasted/uploaded data and proposes mapping ────
router.post('/analyze', async (req, res) => {
  try {
    const { rawData, targetModule, sourceDescription } = req.body;
    if (!rawData || !targetModule) {
      return res.status(400).json({ error: 'rawData and targetModule are required' });
    }

    const schema = TARGET_SCHEMAS[targetModule];
    if (!schema) {
      return res.status(400).json({ error: `Unknown target module: ${targetModule}` });
    }

    const systemPrompt = `You are a fire department data migration expert. Your job is to analyze raw data from various fire department software systems (legacy RMS exports, spreadsheets, hand-typed lists, etc.) and map it to a standardized database schema.

You understand common fire department data formats, abbreviations, and conventions:
- Ranks: FF, LT, CPT, BC, DC, Chief → Firefighter, Lieutenant, Captain, Battalion Chief, Deputy Chief, Chief
- Status: A/Active, I/Inactive, LOA/Leave of Absence
- Dates: Various formats (MM/DD/YYYY, M/D/YY, YYYY-MM-DD, "Jan 5, 2024")
- Certifications: FF1, FF2, EMT-B, AEMT, Paramedic, HazMat Ops, etc.

Be thorough but conservative — only map fields you're confident about. Mark uncertain mappings.`;

    const schemaDesc = schema.columns.map(c =>
      `  - ${c.name} (${c.type}${c.required ? ', REQUIRED' : ''}): ${c.description}`
    ).join('\n');

    const userPrompt = `Analyze this data and map it to the "${schema.label}" schema.

TARGET SCHEMA (${schema.table}):
${schemaDesc}

SOURCE DESCRIPTION: ${sourceDescription || 'Not provided'}

RAW DATA (first 3000 chars):
${rawData.slice(0, 3000)}

Respond with a JSON object:
{
  "detectedFormat": "csv|tsv|json|freeform|table|unknown",
  "detectedSource": "Best guess of source system (legacy RMS export, Excel, hand-typed, etc.)",
  "totalRecords": <number of records detected>,
  "columnMapping": [
    {
      "sourceColumn": "original column name or position",
      "targetColumn": "schema column name",
      "confidence": "high|medium|low",
      "transformNote": "any transformation needed (date format, abbreviation expansion, etc.)"
    }
  ],
  "unmappedSourceColumns": ["columns in source that don't map to any target field"],
  "missingRequiredFields": ["required target fields not found in source"],
  "sampleRows": [<first 3 rows as objects mapped to target schema>],
  "warnings": ["any data quality issues, duplicates, or concerns"],
  "summary": "Brief human-readable summary of what was found"
}`;

    const raw = await callAI(
      guardedSystemPrompt(systemPrompt),
      guardedUserPrompt('Data:\n', userPrompt),
      {
        maxTokens: 4096,
        temperature: 0.3,
        heavy: false,
        meta: { stationId: req.user.department_id, action: 'data_ingest_analyze' },
      },
    );

    // Try to parse JSON from response
    let analysis;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: raw, rawResponse: true };
    } catch {
      analysis = { summary: raw, rawResponse: true };
    }

    res.json({ analysis, schema: { module: targetModule, ...schema } });
  } catch (err) {
    if (sendAIError(res, err)) return;
    console.error('AI data analysis error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /transform — AI transforms raw data into import-ready rows ─────────
router.post('/transform', async (req, res) => {
  try {
    const { rawData, targetModule, columnMapping, sourceDescription } = req.body;
    if (!rawData || !targetModule || !columnMapping) {
      return res.status(400).json({ error: 'rawData, targetModule, and columnMapping are required' });
    }

    const schema = TARGET_SCHEMAS[targetModule];
    if (!schema) {
      return res.status(400).json({ error: `Unknown target module: ${targetModule}` });
    }

    const systemPrompt = `You are a fire department data transformation engine. Given raw data and a column mapping, produce clean, normalized rows ready for database insertion.

Rules:
- Dates MUST be YYYY-MM-DD format
- Normalize ranks: FF→Firefighter I, LT→Lieutenant, CPT→Captain, BC→Battalion Chief, DC→Deputy Chief
- Normalize status: A→Active, I→Inactive, LOA→Leave of Absence
- Phone numbers: strip to digits, format as (XXX) XXX-XXXX if US
- Trim all whitespace
- Empty/null fields should be null, not empty string
- If a field can't be confidently transformed, set it to null and add to warnings`;

    const mappingDesc = columnMapping.map(m =>
      `  "${m.sourceColumn}" → "${m.targetColumn}"${m.transformNote ? ` (${m.transformNote})` : ''}`
    ).join('\n');

    const targetCols = schema.columns.map(c => c.name.replace(/"/g, '')).join(', ');

    const userPrompt = `Transform this raw data into clean rows for the "${schema.label}" table.

COLUMN MAPPING:
${mappingDesc}

TARGET COLUMNS: ${targetCols}

SOURCE DESCRIPTION: ${sourceDescription || 'Unknown'}

RAW DATA:
${rawData.slice(0, 8000)}

Respond with a JSON object:
{
  "rows": [
    { <targetColumn>: <cleanValue>, ... },
    ...
  ],
  "warnings": ["any issues encountered during transformation"],
  "skippedRows": [{ "rowIndex": <n>, "reason": "why it was skipped" }],
  "stats": {
    "totalInput": <number>,
    "transformed": <number>,
    "skipped": <number>
  }
}

IMPORTANT: Return ALL rows, not just samples. Include every record from the raw data.`;

    const raw = await callAI(
      guardedSystemPrompt(systemPrompt),
      guardedUserPrompt('Data:\n', userPrompt),
      {
        maxTokens: 4096,
        temperature: 0.1,
        heavy: false,
        meta: { stationId: req.user.department_id, action: 'data_ingest_transform' },
      },
    );

    let result;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { rows: [], warnings: ['Failed to parse AI response'], rawResponse: raw };
    } catch {
      result = { rows: [], warnings: ['Failed to parse AI response'], rawResponse: raw };
    }

    res.json(result);
  } catch (err) {
    if (sendAIError(res, err)) return;
    console.error('AI data transform error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /import — Insert transformed rows into the database ────────────────
router.post('/import', async (req, res) => {
  try {
    const { targetModule, rows } = req.body;
    if (!targetModule || !rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'targetModule and rows[] are required' });
    }

    const schema = TARGET_SCHEMAS[targetModule];
    if (!schema) {
      return res.status(400).json({ error: `Unknown target module: ${targetModule}` });
    }

    const stationId = req.user.department_id;
    let inserted = 0;
    let failed = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const row = rows[i];
        // Tenancy: every import target table carries station_id — ALWAYS stamp
        // the authenticated station, and NEVER honor a client-supplied value.
        // (Pre-2026-06-10 this only stamped 4 tables and trusted client rows,
        // letting imports land station-less or in another department — W2.5.)
        row.station_id = stationId;
        // Build dynamic INSERT
        const cols = Object.keys(row).filter(k => row[k] !== null && row[k] !== undefined);

        const colNames = cols.map(c => c.startsWith('"') ? c : (/[A-Z]/.test(c) ? `"${c}"` : c)).join(', ');
        const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(', ');
        const values = cols.map(c => {
          const v = row[c];
          // Handle arrays (certifications)
          if (Array.isArray(v)) return JSON.stringify(v);
          return v;
        });

        await pool.query(
          `INSERT INTO ${schema.table} (${colNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          values
        );
        inserted++;
      } catch (rowErr) {
        failed++;
        errors.push({ row: i, error: rowErr.message });
      }
    }

    res.json({ inserted, failed, total: rows.length, errors: errors.slice(0, 20) });
  } catch (err) {
    console.error('AI data import error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /schemas — Return available target schemas for the UI ───────────────
router.get('/schemas', (req, res) => {
  const schemas = Object.entries(TARGET_SCHEMAS).map(([key, val]) => ({
    id: key,
    label: val.label,
    table: val.table,
    columns: val.columns,
  }));
  res.json({ data: schemas });
});

module.exports = router;
