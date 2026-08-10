'use strict';
/**
 * routes/fiCodeLibrary.js — the department's editable violation-code library
 * (Prevention Core Phase 1, 2026-07-12).
 *
 * Replaces the hardcoded client-side code array as the source of truth (clients
 * switch over in Phase 3). Every entry is a CITATION — code + short paraphrased
 * title + optional deep link + dept-authored remediation text. NO copyrighted
 * code text is shipped or seeded (licensing tiers, jurisdiction research 2026-07-12);
 * departments may paste their own adopted text into remediation_text.
 *
 * Gates: reads = any authenticated member; writes = officer+ (designation-gated as of Phase 3). Retire-don't-delete: DELETE soft-deletes
 * (audited); prefer PATCH {active:false} for codes still referenced by checklists.
 */
const express = require('express');
const router  = express.Router();
const { z } = require('zod');
const { pool } = require('../db');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { loadFiContext, requirePreventionAdmin } = require('../middleware/fiAuth');
const { audit } = require('../utils/auditLog');
const { toCsv, parseCsv } = require('../utils/csv');

const idParam = validate({ params: z.object({ id: z.string().regex(/^\d+$/) }) });
const bodySchema = z.object({
  code:             z.string().trim().min(1).max(40),
  title:            z.string().trim().max(300).default(''),
  category:         z.string().trim().max(120).default(''),
  code_body:        z.string().trim().max(120).default(''),
  edition:          z.string().trim().max(40).default(''),
  section:          z.string().trim().max(120).default(''),
  link_url:         z.string().trim().max(2000).default(''),
  remediation_text: z.string().trim().max(5000).default(''),
  active:           z.boolean().default(true),
  sort_order:       z.number().int().default(0),
});

const COLS = `id, code, title, category, code_body, edition, section, link_url,
              remediation_text, active, sort_order, created_at, updated_at`;

router.get('/', scoped(async ({ stationId }) => {
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM fi_code_library
     WHERE department_id = $1 AND deleted_at IS NULL
     ORDER BY sort_order, code`, [stationId]);
  return { data: rows };
}));

router.post('/', loadFiContext, requirePreventionAdmin, validate({ body: bodySchema }), scoped(async ({ req, stationId, user }) => {
  const b = req.body;
  const { rows } = await pool.query(
    `INSERT INTO fi_code_library (department_id, code, title, category, code_body,
       edition, section, link_url, remediation_text, active, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (department_id, code) DO NOTHING
     RETURNING ${COLS}`,
    [stationId, b.code, b.title, b.category, b.code_body, b.edition, b.section,
     b.link_url, b.remediation_text, b.active, b.sort_order]);
  if (!rows.length) throw httpError(409, `Code '${b.code}' already exists in this department's library.`, 'DUPLICATE_CODE');
  await audit(stationId, user, 'create', 'fi_code_library', rows[0].id, { code: b.code });
  return { data: rows[0], _status: 201 };
}));

router.patch('/:id', loadFiContext, requirePreventionAdmin, idParam, validate({ body: bodySchema.partial() }), scoped(async ({ req, stationId, user }) => {
  const allowed = ['code','title','category','code_body','edition','section','link_url','remediation_text','active','sort_order'];
  const sets = []; const vals = [];
  for (const k of allowed) if (req.body[k] !== undefined) { vals.push(req.body[k]); sets.push(`${k} = $${vals.length}`); }
  if (!sets.length) throw httpError(400, 'No editable fields in request.', 'EMPTY_PATCH');
  vals.push(req.params.id, stationId);
  const { rows } = await pool.query(
    `UPDATE fi_code_library SET ${sets.join(', ')}, updated_at = NOW()
     WHERE id = $${vals.length - 1} AND department_id = $${vals.length} AND deleted_at IS NULL
     RETURNING ${COLS}`, vals);
  if (!rows.length) throw httpError(404, 'Not found', 'NOT_FOUND');
  await audit(stationId, user, 'update', 'fi_code_library', rows[0].id, { fields: Object.keys(req.body) });
  return { data: rows[0] };
}));

router.delete('/:id', loadFiContext, requirePreventionAdmin, idParam, scoped(async ({ req, stationId, user }) => {
  const { rows } = await pool.query(
    `UPDATE fi_code_library SET deleted_at = NOW()
     WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL RETURNING id`,
    [req.params.id, stationId]);
  if (!rows.length) throw httpError(404, 'Not found', 'NOT_FOUND');
  await audit(stationId, user, 'soft_delete', 'fi_code_library', rows[0].id, {});
  return { message: 'Code retired.' };
}));

// ── Starter set (explicit, officer-invoked — never auto-magic) ────────────────
// The OF-maintained IFC 2021 MASTER LIBRARY — 79 sections (expanded from the
// 26-code starter same day, Matt-approved). Selection grounded in AHJ/fire-marshal
// common-violation lists; departments curate DOWN from here (deactivate/edit/CSV),
// matching how the market's vendor code libraries work.
// Every section number + deep-link anchor was verified against the free official
// ICC reading room (codes.iccsafe.org/content/IFC2021P1) — never from memory —
// and the mapping was approved by Matt (working NJ fire inspector) 2026-07-16.
// Titles remain OpenFirehouse-authored generic paraphrase; NO copyrighted code
// text is shipped or seeded — link_url carries readers to the official text.
// DECISION A (Matt, working NJ fire inspector, 2026-07-16): THE SECTION IS THE CODE.
// An inspector cites ONE identifier — the adopted-code section. The synthetic
// 1001-style index that used to key these rows is DELETED (it put two numbering
// systems on every picker row and every notice). `code` and `section` now carry
// the same value; `edition` supplies the display prefix ("IFC 2021 §906.1").
// Row shape: [code(=section), title, category, link_url]. Edition applied uniformly.
// Idempotent (ON CONFLICT skips codes the department already has).
const STARTER_EDITION = 'IFC 2021';
const ICC = 'https://codes.iccsafe.org/content/IFC2021P1';
const CH01 = `${ICC}/chapter-1-scope-and-administration#IFC2021P1_Pt01_Ch01_Sec`;
const CH03 = `${ICC}/chapter-3-general-requirements#IFC2021P1_Pt02_Ch03_Sec`;
const CH04 = `${ICC}/chapter-4-emergency-planning-and-preparedness#IFC2021P1_Pt02_Ch04_Sec`;
const CH05 = `${ICC}/chapter-5-fire-service-features#IFC2021P1_Pt03_Ch05_Sec`;
const CH06 = `${ICC}/chapter-6-building-services-and-systems#IFC2021P1_Pt03_Ch06_Sec`;
const CH07 = `${ICC}/chapter-7-fire-and-smoke-protection-features#IFC2021P1_Pt03_Ch07_Sec`;
const CH08 = `${ICC}/chapter-8-interior-finish-decorative-materials-and-furnishings#IFC2021P1_Pt03_Ch08_Sec`;
const CH09 = `${ICC}/chapter-9-fire-protection-and-life-safety-systems#IFC2021P1_Pt03_Ch09_Sec`;
const CH10 = `${ICC}/chapter-10-means-of-egress#IFC2021P1_Pt03_Ch10_Sec`;
const CH11 = `${ICC}/chapter-11-construction-requirements-for-existing-buildings#IFC2021P1_Pt03_Ch11_Sec`;
const CH35 = `${ICC}/chapter-35-welding-and-other-hot-work#IFC2021P1_Pt04_Ch35_Sec`;
const CH50 = `${ICC}/chapter-50-hazardous-materials-general-provisions#IFC2021P1_Pt05_Ch50_Sec`;
const CH53 = `${ICC}/chapter-53-compressed-gases#IFC2021P1_Pt05_Ch53_Sec`;
const CH57 = `${ICC}/chapter-57-flammable-and-combustible-liquids#IFC2021P1_Pt05_Ch57_Sec`;
const CH61 = `${ICC}/chapter-61-liquefied-petroleum-gases#IFC2021P1_Pt05_Ch61_Sec`;
const STARTER = [
  // ── Egress ──
  ['1032.2','Exit obstructed or blocked','Egress',`${CH10}1032.2`],
  ['1032.3','Means of egress obstructed (incl. snow/ice)','Egress',`${CH10}1032.3`],
  ['1032.4','Exit sign missing, obscured, or non-illuminated','Egress',`${CH10}1032.4`],
  ['1032.5','Confusable non-exit door not identified','Egress',`${CH10}1032.5`],
  ['1032.6','Egress door concealed or not distinguishable','Egress',`${CH10}1032.6`],
  ['1032.10','Emergency lighting inoperable','Egress',`${CH10}1032.10`],
  ['1010.2','Door hardware not code compliant','Egress',`${CH10}1010.2`],
  ['1010.2.4','Locked exit door during occupancy','Egress',`${CH10}1010.2.4`],
  ['1010.2.9','Panic hardware missing or noncompliant','Egress',`${CH10}1010.2.9`],
  ['1008.2','Egress illumination not provided while occupied','Egress',`${CH10}1008.2`],
  ['1008.3','Emergency power for egress lighting deficient','Egress',`${CH10}1008.3`],
  ['1013.1','Exit signs not provided where required','Egress',`${CH10}1013.1`],
  ['1031.1','Emergency escape and rescue opening noncompliant','Egress',`${CH10}1031.1`],
  ['1031.6','Bars/grilles over escape opening without approved release','Egress',`${CH10}1031.6`],
  // ── Fire Protection Systems ──
  ['906.1','Fire extinguisher missing, overdue, or improperly mounted','Fire Protection Systems',`${CH09}906.1`],
  ['906.5','Extinguisher not in conspicuous, readily accessible location','Fire Protection Systems',`${CH09}906.5`],
  ['906.6','Extinguisher obstructed or obscured from view','Fire Protection Systems',`${CH09}906.6`],
  ['901.7','Sprinkler system impaired or partially out of service','Fire Protection Systems',`${CH09}901.7`],
  ['901.6','Sprinkler head obstructed or painted','Fire Protection Systems',`${CH09}901.6`],
  ['901.6.1','Suppression system not tested within required interval','Fire Protection Systems',`${CH09}901.6.1`],
  ['901.4.6','Nonfunctional equipment resembling fire protection equipment','Fire Protection Systems',`${CH09}901.4.6`],
  ['903.4.2','Sprinkler waterflow alarm device missing or noncompliant','Fire Protection Systems',`${CH09}903.4.2`],
  ['904.13','Kitchen hood fire-extinguishing system noncompliant','Fire Protection Systems',`${CH09}904.13`],
  ['904.13.5.2','Hood suppression system service overdue (6-month)','Fire Protection Systems',`${CH09}904.13.5.2`],
  ['907.8','Fire alarm system impaired or panel in trouble','Fire Protection Systems',`${CH09}907.8`],
  ['907.2.11','Smoke detector missing, discharged, or missing battery','Fire Protection Systems',`${CH09}907.2.11`],
  // ── Fire Service Access & Water Supply ──
  ['503.4','Fire lane / apparatus access road obstructed','Fire Service Access & Water Supply',`${CH05}503.4`],
  ['505.1','Address identification missing or not visible from street','Fire Service Access & Water Supply',`${CH05}505.1`],
  ['506.1','Rapid-entry key box required / not provided','Fire Service Access & Water Supply',`${CH05}506.1`],
  ['507.5.4','Fire hydrant access obstructed','Fire Service Access & Water Supply',`${CH05}507.5.4`],
  ['507.5.5','3-foot clear space around hydrant not maintained','Fire Service Access & Water Supply',`${CH05}507.5.5`],
  ['912.4.2','Fire department connection (FDC) obstructed','Fire Service Access & Water Supply',`${CH09}912.4.2`],
  // ── Housekeeping & Storage ──
  ['305.1','Combustible materials stored too close to heat source','Housekeeping & Storage',`${CH03}305.1`],
  ['304.1','Excessive accumulation of combustibles / housekeeping','Housekeeping & Storage',`${CH03}304.1`],
  ['304.3','Combustible waste container / dumpster storage noncompliant','Housekeeping & Storage',`${CH03}304.3`],
  ['307.1','Open burning without required approval','Housekeeping & Storage',`${CH03}307.1`],
  ['307.1.1','Open burning under hazardous conditions','Housekeeping & Storage',`${CH03}307.1.1`],
  ['308.1.4','Open-flame cooking on combustible balcony or within 10 ft','Housekeeping & Storage',`${CH03}308.1.4`],
  ['310.3','Required "No Smoking" signs not posted','Housekeeping & Storage',`${CH03}310.3`],
  ['310.5','No smoking violation in restricted area','Housekeeping & Storage',`${CH03}310.5`],
  ['311.1','Vacant/unoccupied building not safeguarded','Housekeeping & Storage',`${CH03}311.1`],
  ['315.3.2','Combustible storage in exits or stair enclosures','Housekeeping & Storage',`${CH03}315.3.2`],
  ['5704.3','Flammable/combustible liquid improperly stored','Housekeeping & Storage',`${CH57}5704.3`],
  // ── Electrical ──
  ['603.4','Electrical panel obstructed (36" clearance required)','Electrical',`${CH06}603.4`],
  ['603.6','Extension cord used as permanent wiring','Electrical',`${CH06}603.6`],
  ['603.2.2','Open junction box or exposed wiring','Electrical',`${CH06}603.2.2`],
  ['603.5','Overloaded circuit or multi-tap without protection','Electrical',`${CH06}603.5`],
  ['603.8','Temporary wiring in use beyond 90 days','Electrical',`${CH06}603.8`],
  ['603.9','Portable electric space heater used contrary to code','Electrical',`${CH06}603.9`],
  // ── Cooking & Building Services ──
  ['606.2','Type I hood missing at commercial cooking appliance','Cooking & Building Services',`${CH06}606.2`],
  ['606.3','Commercial cooking system not maintained','Cooking & Building Services',`${CH06}606.3`],
  ['606.3.3','Hood / grease duct cleaning overdue','Cooking & Building Services',`${CH06}606.3.3`],
  ['610.1','Clothes dryer exhaust duct system noncompliant','Cooking & Building Services',`${CH06}610.1`],
  // ── Fire-Resistance Features ──
  ['701.6','Owner inventory of fire-resistance-rated construction not maintained','Fire-Resistance Features',`${CH07}701.6`],
  ['703.1','Penetration firestopping not maintained','Fire-Resistance Features',`${CH07}703.1`],
  ['703.2','Damaged penetration protection not repaired','Fire-Resistance Features',`${CH07}703.2`],
  ['704.1','Fire-resistive joint/void protection not maintained','Fire-Resistance Features',`${CH07}704.1`],
  // ── Decorations & Furnishings ──
  ['806.1','Natural cut tree displayed contrary to code','Decorations & Furnishings',`${CH08}806.1`],
  ['807.1','Flammable decorations or furnishings','Decorations & Furnishings',`${CH08}807.1`],
  ['808.1','Noncompliant waste containers in institutional/health occupancies','Decorations & Furnishings',`${CH08}808.1`],
  // ── Emergency Planning ──
  ['404.3','Fire safety/evacuation plan not reviewed or updated annually','Emergency Planning',`${CH04}404.3`],
  ['405.2','Required evacuation drills not conducted','Emergency Planning',`${CH04}405.2`],
  // ── Existing Buildings ──
  ['1103.8','Smoke alarms missing in existing Group I-1/R occupancy','Existing Buildings',`${CH11}1103.8`],
  ['1103.9','CO detection missing where required in existing occupancy','Existing Buildings',`${CH11}1103.9`],
  // ── Hot Work ──
  ['3503.3','Hot work without permit available for review','Hot Work',`${CH35}3503.3`],
  ['3504.1','Combustibles not protected during hot work','Hot Work',`${CH35}3504.1`],
  // ── Occupancy & Administrative ──
  ['105.1.1','Missing or expired occupancy permit','Occupancy & Administrative',`${CH01}105.1.1`],
  ['102.3','Change of use without fire marshal approval','Occupancy & Administrative',`${CH01}102.3`],
  ['109.6','Overcrowding — occupant load limit exceeded','Occupancy & Administrative',`${CH01}109.6`],
  ['404.4','Required fire safety plan not posted','Occupancy & Administrative',`${CH04}404.4`],
  // ── Hazardous Materials & Gases ──
  ['105.5.22','Hazardous materials stored without permit','Hazardous Materials',`${CH01}105.5.22`],
  ['5003.4','MSDS / SDS not available or not current','Hazardous Materials',`${CH50}5003.4`],
  ['5004.2','Secondary containment missing or inadequate','Hazardous Materials',`${CH50}5004.2`],
  ['5303.5.3','Compressed gas cylinders not secured','Hazardous Materials',`${CH53}5303.5.3`],
  ['5704.3.2','Flammable liquid storage cabinet noncompliant','Hazardous Materials',`${CH57}5704.3.2`],
  ['5704.3.3','Indoor flammable/combustible liquid storage noncompliant','Hazardous Materials',`${CH57}5704.3.3`],
  ['5705.3','Indoor use/dispensing of flammable liquids noncompliant','Hazardous Materials',`${CH57}5705.3`],
  ['6109.1','Portable LP-gas container storage noncompliant','Hazardous Materials',`${CH61}6109.1`],
  ['6109.13','LP-gas containers not protected or secured','Hazardous Materials',`${CH61}6109.13`],
];

router.post('/seed-starter', loadFiContext, requirePreventionAdmin, scoped(async ({ stationId, user }) => {
  const { rows } = await pool.query(
    `INSERT INTO fi_code_library (department_id, code, title, category, section, edition, link_url, sort_order)
     SELECT $1, s->>0, s->>1, s->>2, s->>0, $3, s->>3, (ord - 1)::int
     FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS t(s, ord)
     ON CONFLICT (department_id, code) DO NOTHING
     RETURNING id`,
    [stationId, JSON.stringify(STARTER), STARTER_EDITION]);
  await audit(stationId, user, 'create', 'fi_code_library', null, { seedStarter: rows.length });
  return { message: `Starter library loaded: ${rows.length} codes added.`, added: rows.length };
}));

// ── CSV import / export (2026-07-15) ─────────────────────────────────────────
// The department brings its OWN adopted codes; typing each one by hand is the friction we
// remove. Export + template generate injection-safe CSV; import parses, VALIDATES every row,
// and upserts in ONE atomic statement — never overwriting a non-empty existing field with a
// blank, so a re-import can't silently wipe a bureau's authored remediation text.
const CSV_COLS = [
  { key: 'code', header: 'code' }, { key: 'title', header: 'title' },
  { key: 'category', header: 'category' }, { key: 'code_body', header: 'code_body' },
  { key: 'edition', header: 'edition' }, { key: 'section', header: 'section' },
  { key: 'link_url', header: 'link_url' }, { key: 'remediation_text', header: 'remediation_text' },
  { key: 'active', header: 'active' }, { key: 'sort_order', header: 'sort_order' },
];
const MAX_IMPORT_ROWS = 2000;
const FIELD_MAX = { code: 40, title: 300, category: 120, code_body: 120, edition: 40, section: 120, link_url: 2000, remediation_text: 5000 };
const isTruthy = (v) => ['true', '1', 'yes', 'y', 'active'].includes(String(v || '').trim().toLowerCase());
const isFalsy  = (v) => ['false', '0', 'no', 'n', 'inactive', 'retired'].includes(String(v || '').trim().toLowerCase());

/** Validate + clean one parsed CSV row. @returns {{ok:true,rec}|{ok:false,reason}} */
function cleanRow(raw) {
  const code = String(raw.code || '').trim();
  if (!code) return { ok: false, reason: 'missing code' };
  if (code.length > FIELD_MAX.code) return { ok: false, reason: `code too long (>${FIELD_MAX.code})` };
  const rec = { code };
  for (const k of ['title', 'category', 'code_body', 'edition', 'section', 'link_url', 'remediation_text']) {
    const v = String(raw[k] || '').trim();
    if (v.length > FIELD_MAX[k]) return { ok: false, reason: `${k} too long (>${FIELD_MAX[k]})` };
    rec[k] = v;
  }
  const a = String(raw.active || '').trim();
  // active defaults TRUE; a garbage value is an ERROR, never silently true (fail-loud).
  rec.active = a === '' ? true : isTruthy(a) ? true : isFalsy(a) ? false : null;
  if (rec.active === null) return { ok: false, reason: `active must be true/false (got "${a}")` };
  const so = String(raw.sort_order || '').trim();
  rec.sort_order = so === '' ? 0 : Number.parseInt(so, 10);
  if (!Number.isFinite(rec.sort_order)) return { ok: false, reason: `sort_order must be a whole number (got "${so}")` };
  return { ok: true, rec };
}

/** Parse + validate a CSV body — pure of the DB, so it is unit-testable and drives the dry run. */
function analyzeImport(csvText) {
  const { header, rows } = parseCsv(csvText);
  if (!rows.length) return { fatal: 'The file has no data rows.', code: 'EMPTY_IMPORT' };
  if (!header.includes('code')) return { fatal: 'The file needs a "code" column header.', code: 'MISSING_CODE_COLUMN' };
  if (rows.length > MAX_IMPORT_ROWS) return { fatal: `Too many rows (${rows.length}); the limit is ${MAX_IMPORT_ROWS}.`, code: 'TOO_MANY_ROWS' };
  const errors = [];
  const byCode = new Map();      // dedupe WITHIN the file — last occurrence wins
  let duplicates = 0;
  rows.forEach((raw, i) => {
    const line = i + 2;          // +1 for zero-index, +1 for the header row
    const res = cleanRow(raw);
    if (!res.ok) { errors.push({ line, code: String(raw.code || '').trim(), reason: res.reason }); return; }
    if (byCode.has(res.rec.code)) duplicates++;
    byCode.set(res.rec.code, res.rec);
  });
  return { records: [...byCode.values()], errors, duplicates, total: rows.length };
}

router.get('/export', scoped(async ({ stationId }) => {
  const { rows } = await pool.query(
    `SELECT code, title, category, code_body, edition, section, link_url, remediation_text, active, sort_order
     FROM fi_code_library WHERE department_id = $1 AND deleted_at IS NULL ORDER BY sort_order, code`, [stationId]);
  const csv = toCsv(rows.map((r) => ({ ...r, active: r.active ? 'true' : 'false' })), CSV_COLS);
  return { data: { csv, filename: `code-library-${stationId}.csv`, count: rows.length } };
}));

const TEMPLATE_ROWS = [
  { code: '1032.2', title: 'Blocked or obstructed exit / egress path', category: 'Egress',
    code_body: 'IFC', edition: 'IFC 2021', section: '1032.2', link_url: 'https://codes.iccsafe.org/',
    remediation_text: 'Keep the required means of egress clear and unobstructed at all times.',
    active: 'true', sort_order: '0' },
  { code: '906.1', title: 'Fire extinguisher missing, overdue, or improperly mounted',
    category: 'Fire Protection Systems', code_body: 'IFC', edition: 'IFC 2021', section: '906.1', link_url: '',
    remediation_text: 'Provide, service, and properly mount the required extinguisher(s).',
    active: 'true', sort_order: '1' },
];
// DECISION A (2026-07-16): the section IS the code — the example rows model it (`code` =
// the adopted section number, duplicated into `section`; `edition` carries the display
// prefix). Departments enter THEIR adopted code's sections; the titles stay generic.
router.get('/template', scoped(async () => ({
  data: { csv: toCsv(TEMPLATE_ROWS, CSV_COLS), filename: 'code-library-template.csv' },
})));

const importSchema = z.object({
  csv: z.string().min(1).max(2_000_000),   // ~2 MB — a code library is tiny; this is a guard
  dryRun: z.boolean().default(false),
});
router.post('/import', loadFiContext, requirePreventionAdmin, validate({ body: importSchema }),
  scoped(async ({ req, stationId, user }) => {
    const a = analyzeImport(req.body.csv);
    if (a.fatal) throw httpError(400, a.fatal, a.code);
    const { records, errors, duplicates, total } = a;

    // Classify add vs update against what the department already has. A READ, not a write —
    // so the dry-run preview needs no transaction and can never leave a partial write.
    const existing = new Set(
      (await pool.query('SELECT code FROM fi_code_library WHERE department_id = $1', [stationId]))
        .rows.map((r) => r.code));
    const willAdd = records.filter((r) => !existing.has(r.code)).length;
    const willUpdate = records.length - willAdd;

    if (req.body.dryRun) {
      return { data: { dryRun: true, willAdd, willUpdate, duplicatesInFile: duplicates,
        errors, validRows: records.length, total } };
    }
    if (!records.length) throw httpError(400, 'No valid rows to import — every row had an error.', 'NO_VALID_ROWS');

    // ONE atomic upsert (the seed-starter pattern). COALESCE(NULLIF(...)) means a BLANK cell in
    // the file never wipes an existing non-empty value. `xmax = 0` tells inserted from updated,
    // so the report is honest rather than guessed.
    const { rows: applied } = await pool.query(
      `INSERT INTO fi_code_library
         (department_id, code, title, category, code_body, edition, section, link_url, remediation_text, active, sort_order)
       SELECT $1, e->>'code', e->>'title', e->>'category', e->>'code_body', e->>'edition',
              e->>'section', e->>'link_url', e->>'remediation_text',
              (e->>'active')::boolean, (e->>'sort_order')::int
       FROM jsonb_array_elements($2::jsonb) AS e
       ON CONFLICT (department_id, code) DO UPDATE SET
         title            = COALESCE(NULLIF(EXCLUDED.title, ''), fi_code_library.title),
         category         = COALESCE(NULLIF(EXCLUDED.category, ''), fi_code_library.category),
         code_body        = COALESCE(NULLIF(EXCLUDED.code_body, ''), fi_code_library.code_body),
         edition          = COALESCE(NULLIF(EXCLUDED.edition, ''), fi_code_library.edition),
         section          = COALESCE(NULLIF(EXCLUDED.section, ''), fi_code_library.section),
         link_url         = COALESCE(NULLIF(EXCLUDED.link_url, ''), fi_code_library.link_url),
         remediation_text = COALESCE(NULLIF(EXCLUDED.remediation_text, ''), fi_code_library.remediation_text),
         active           = EXCLUDED.active,
         sort_order       = EXCLUDED.sort_order,
         updated_at       = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [stationId, JSON.stringify(records)]);
    const added = applied.filter((r) => r.inserted).length;
    const updated = applied.length - added;
    await audit(stationId, user, 'create', 'fi_code_library', null,
      { import: true, added, updated, skipped: errors.length, duplicatesInFile: duplicates });
    return { data: { added, updated, skipped: errors.length, duplicatesInFile: duplicates, errors, total } };
  }));

module.exports = router;
module.exports.analyzeImport = analyzeImport;   // exported for unit tests (pure, no DB)
module.exports.cleanRow = cleanRow;
