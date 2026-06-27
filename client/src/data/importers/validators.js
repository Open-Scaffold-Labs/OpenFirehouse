// ─── Validators ──────────────────────────────────────────────────────────────
// Per-record-type field validation rules.
// Each rule: { field, label, required, type, allowed, maxLength }
// Validate row: returns { valid: bool, errors: string[] }

export const VALIDATORS = {

  runlist: [
    { field: 'unit',     label: 'Unit / Apparatus', required: true,  type: 'string', maxLength: 60 },
    { field: 'position', label: 'Position',         required: false, type: 'string', maxLength: 60 },
    { field: 'name',     label: 'Name',             required: true,  type: 'string', maxLength: 80 },
    { field: 'rank',     label: 'Rank',             required: false, type: 'string', maxLength: 40 },
  ],

  members: [
    { field: 'firstName',  label: 'First Name',  required: true,  type: 'string', maxLength: 50 },
    { field: 'lastName',   label: 'Last Name',   required: true,  type: 'string', maxLength: 50 },
    { field: 'rank',       label: 'Rank',        required: false, type: 'string' },
    { field: 'email',      label: 'Email',       required: false, type: 'email'  },
    { field: 'phone',      label: 'Phone',       required: false, type: 'phone'  },
    { field: 'hireDate',   label: 'Hire Date',   required: false, type: 'date'   },
    {
      field: 'status',     label: 'Status',      required: false, type: 'allowed',
      allowed: ['Active', 'Inactive', 'Leave', 'Retired', 'Probationary', ''],
    },
  ],

  incidents: [
    { field: 'incidentNumber', label: 'Incident Number', required: true,  type: 'string' },
    { field: 'date',           label: 'Date',            required: true,  type: 'date'   },
    { field: 'type',           label: 'Incident Type',   required: true,  type: 'string' },
    { field: 'address',        label: 'Address',         required: false, type: 'string' },
    { field: 'dispatchTime',   label: 'Dispatch Time',   required: false, type: 'time_or_datetime' },
    { field: 'clearTime',      label: 'Clear Time',      required: false, type: 'time_or_datetime' },
    { field: 'injuries',       label: 'Injuries',        required: false, type: 'integer' },
  ],

  training: [
    { field: 'memberLastName',  label: 'Member Last Name',  required: true,  type: 'string' },
    { field: 'memberFirstName', label: 'Member First Name', required: false, type: 'string' },
    { field: 'courseName',      label: 'Course Name',       required: true,  type: 'string' },
    { field: 'provider',        label: 'Provider',          required: false, type: 'string' },
    { field: 'completionDate',  label: 'Completion Date',   required: true,  type: 'date'   },
    { field: 'expirationDate',  label: 'Expiration Date',   required: false, type: 'date'   },
    { field: 'hoursCompleted',  label: 'Hours',             required: false, type: 'number' },
  ],

  apparatus: [
    { field: 'unitId',  label: 'Unit ID',  required: true,  type: 'string' },
    { field: 'type',    label: 'Type',     required: true,  type: 'string' },
    { field: 'year',    label: 'Year',     required: false, type: 'integer', min: 1900, max: 2030 },
    { field: 'mileage', label: 'Mileage',  required: false, type: 'integer' },
    {
      field: 'status',  label: 'Status',   required: false, type: 'allowed',
      allowed: ['In Service', 'Out of Service', 'Reserve', 'Repair', ''],
    },
  ],

  assets: [
    { field: 'name',     label: 'Item Name', required: true,  type: 'string' },
    { field: 'quantity', label: 'Quantity',  required: true,  type: 'integer', min: 0 },
    { field: 'category', label: 'Category',  required: false, type: 'string' },
  ],
};

// ── Validation helpers ────────────────────────────────────────────────────────

const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE  = /^[\d\s\-().+]{7,20}$/;
const DATE_RE   = /^\d{4}-\d{2}-\d{2}$/;
// Accept HH:MM, HH:MM:SS, or full ISO datetime
const TIME_RE   = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}|\d{2}:\d{2})/;

function isValidDate(str) {
  if (!str) return true; // optional fields
  const normalized = str.replace(/\//g, '-').replace(/(\d{2})-(\d{2})-(\d{4})/, '$3-$1-$2');
  if (!DATE_RE.test(normalized)) return false;
  const d = new Date(normalized);
  return !isNaN(d.getTime());
}

function isValidEmail(str)  { return !str || EMAIL_RE.test(str.trim()); }
function isValidPhone(str)  { return !str || PHONE_RE.test(str.trim()); }
function isValidInt(str, min, max) {
  if (!str) return true;
  const n = parseInt(str, 10);
  if (isNaN(n)) return false;
  if (min != null && n < min) return false;
  if (max != null && n > max) return false;
  return true;
}
function isValidNumber(str) {
  return !str || !isNaN(parseFloat(str));
}

// ── Main validation function ──────────────────────────────────────────────────

export function validateRow(row, recordType) {
  const rules = VALIDATORS[recordType];
  if (!rules) return { valid: true, errors: [], warnings: [] };

  const errors   = [];
  const warnings = [];

  rules.forEach(rule => {
    const val = (row[rule.field] ?? '').toString().trim();

    if (rule.required && !val) {
      errors.push(`${rule.label} is required`);
      return;
    }

    if (!val) return; // skip optional empty fields

    switch (rule.type) {
      case 'email':
        if (!isValidEmail(val)) warnings.push(`${rule.label} doesn't look like a valid email`);
        break;
      case 'phone':
        if (!isValidPhone(val)) warnings.push(`${rule.label} doesn't look like a valid phone number`);
        break;
      case 'date':
        if (!isValidDate(val)) errors.push(`${rule.label} "${val}" is not a valid date (expected YYYY-MM-DD)`);
        break;
      case 'time_or_datetime':
        if (!TIME_RE.test(val) && !isValidDate(val.slice(0, 10))) {
          warnings.push(`${rule.label} "${val}" — could not parse as time or date`);
        }
        break;
      case 'integer':
        if (!isValidInt(val, rule.min, rule.max)) {
          errors.push(`${rule.label} "${val}" must be a whole number${rule.min != null ? ` (${rule.min}–${rule.max ?? '∞'})` : ''}`);
        }
        break;
      case 'number':
        if (!isValidNumber(val)) warnings.push(`${rule.label} "${val}" doesn't look like a number`);
        break;
      case 'allowed':
        if (rule.allowed && !rule.allowed.includes(val)) {
          warnings.push(`${rule.label} "${val}" is not a recognized value`);
        }
        break;
      case 'string':
        if (rule.maxLength && val.length > rule.maxLength) {
          warnings.push(`${rule.label} exceeds ${rule.maxLength} characters`);
        }
        break;
    }
  });

  return { valid: errors.length === 0, errors, warnings };
}

// ── Validate all rows ─────────────────────────────────────────────────────────

export function validateAll(mappedRows, recordType) {
  return mappedRows.map((row, i) => ({
    rowIndex: i,
    row,
    ...validateRow(row, recordType),
  }));
}

// ── Summary ───────────────────────────────────────────────────────────────────

export function getValidationSummary(results) {
  return {
    total:    results.length,
    valid:    results.filter(r => r.valid).length,
    errors:   results.filter(r => !r.valid).length,
    warnings: results.filter(r => r.valid && r.warnings.length > 0).length,
    clean:    results.filter(r => r.valid && r.warnings.length === 0).length,
  };
}
