/**
 * DateDropdown.jsx
 *
 * Renders three selects (Month / Day / Year) that combine into a
 * standard YYYY-MM-DD string, making it easy to enter dates that
 * are many years in the past without scrolling through a calendar.
 *
 * Props
 * ─────
 *  value       – string, YYYY-MM-DD or ''
 *  onChange    – (newValue: string) => void  (receives YYYY-MM-DD or '')
 *  selectClass – Tailwind class(es) applied to every <select>
 *  yearEnd     – last/highest year shown  (default: current year)
 *  yearStart   – first/lowest year shown  (default: yearEnd − 100)
 *  error       – truthy → applies red border styling
 */

import { useState } from 'react';

const MONTHS = [
  { val: '01', label: 'January'   }, { val: '02', label: 'February'  },
  { val: '03', label: 'March'     }, { val: '04', label: 'April'     },
  { val: '05', label: 'May'       }, { val: '06', label: 'June'      },
  { val: '07', label: 'July'      }, { val: '08', label: 'August'    },
  { val: '09', label: 'September' }, { val: '10', label: 'October'   },
  { val: '11', label: 'November'  }, { val: '12', label: 'December'  },
];

const DAYS = Array.from({ length: 31 }, (_, i) =>
  String(i + 1).padStart(2, '0'),
);

function parseParts(value) {
  if (!value) return { y: '', m: '', d: '' };
  const [y = '', m = '', d = ''] = value.split('-');
  return { y, m, d };
}

export default function DateDropdown({
  value        = '',
  onChange,
  selectClass  = '',
  yearEnd,
  yearStart,
  error        = false,
}) {
  const thisYear = new Date().getFullYear();
  const end   = yearEnd   ?? thisYear;
  const start = yearStart ?? end - 100;
  const years = Array.from({ length: end - start + 1 }, (_, i) =>
    String(end - i),
  );

  const init = parseParts(value);
  const [m, setM] = useState(init.m);
  const [d, setD] = useState(init.d);
  const [y, setY] = useState(init.y);

  const errorCls  = error ? ' border-red-400 dark:border-red-700' : '';
  const baseCls   = `${selectClass}${errorCls}`;

  function update(part, val) {
    const newM = part === 'm' ? val : m;
    const newD = part === 'd' ? val : d;
    const newY = part === 'y' ? val : y;
    if (part === 'm') setM(val);
    if (part === 'd') setD(val);
    if (part === 'y') setY(val);
    onChange?.(newM && newD && newY ? `${newY}-${newM}-${newD}` : '');
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
      {/* Month */}
      <select className={baseCls} value={m} onChange={(e) => update('m', e.target.value)} aria-label="Month">
        <option value="">Month</option>
        {MONTHS.map(({ val, label }) => (
          <option key={val} value={val}>{label}</option>
        ))}
      </select>

      {/* Day */}
      <select className={baseCls} value={d} onChange={(e) => update('d', e.target.value)} aria-label="Day">
        <option value="">Day</option>
        {DAYS.map((day) => (
          <option key={day} value={day}>{parseInt(day, 10)}</option>
        ))}
      </select>

      {/* Year */}
      <select className={baseCls} value={y} onChange={(e) => update('y', e.target.value)} aria-label="Year">
        <option value="">Year</option>
        {years.map((yr) => (
          <option key={yr} value={yr}>{yr}</option>
        ))}
      </select>
    </div>
  );
}
