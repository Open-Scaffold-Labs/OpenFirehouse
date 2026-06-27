import { useState, useEffect } from 'react';
import { X, DollarSign, Save } from 'lucide-react';
import { BUDGET_CATEGORIES, SUBCATEGORIES, TRANSACTION_TYPES } from '../data/budget';
import DictateTextarea from './DictateTextarea';

const INPUT = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900';

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const BLANK = {
  date:        new Date().toISOString().slice(0, 10),
  type:        'Expense',
  category:    'Apparatus & Equipment',
  subcategory: '',
  description: '',
  amount:      '',
  vendor:      '',
  checkNumber: '',
  approvedBy:  '',
  notes:       '',
};

export default function BudgetForm({ record, onSave, onClose }) {
  const isEdit = Boolean(record?.id);

  const [form,   setForm]   = useState(() => ({
    ...BLANK,
    ...(isEdit ? { ...record, amount: String(record.amount) } : {}),
  }));
  const [errors, setErrors] = useState({});

  // Keep subcategory valid when category changes
  const subcats = SUBCATEGORIES[form.category] ?? [];
  useEffect(() => {
    if (!subcats.includes(form.subcategory)) {
      setForm((f) => ({ ...f, subcategory: subcats[0] ?? '' }));
    }
  }, [form.category]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function validate() {
    const errs = {};
    if (!form.date)                     errs.date        = 'Date required';
    if (!form.description?.trim())      errs.description = 'Description required';
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0)
                                        errs.amount      = 'Valid amount required';
    if (!form.category)                 errs.category    = 'Category required';
    return errs;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSave({
      ...form,
      id:     record?.id,
      amount: parseFloat(form.amount),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <DollarSign size={18} className="text-red-600 dark:text-red-400" />
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
              {isEdit ? 'Edit Transaction' : 'Add Transaction'}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* Date + Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Date" required>
              <input type="date" className={INPUT} value={form.date} onChange={set('date')} aria-label="Date"
                max={new Date().toISOString().slice(0, 10)} />
              {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date}</p>}
            </Field>
            <Field label="Transaction Type" required>
              <select className={INPUT} value={form.type} onChange={set('type')} aria-label="Transaction type">
                {TRANSACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
          </div>

          {/* Category + Subcategory */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Category" required>
              <select className={INPUT} value={form.category} onChange={set('category')} aria-label="Category">
                {BUDGET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {errors.category && <p className="text-xs text-red-500 mt-1">{errors.category}</p>}
            </Field>
            <Field label="Subcategory">
              <select className={INPUT} value={form.subcategory} onChange={set('subcategory')} aria-label="Subcategory">
                {subcats.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          {/* Description */}
          <Field label="Description" required>
            <input type="text" className={INPUT} value={form.description} aria-label="Description"
              onChange={set('description')} placeholder="What was purchased or received?" />
            {errors.description && <p className="text-xs text-red-500 mt-1">{errors.description}</p>}
          </Field>

          {/* Amount + Vendor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Amount ($)" required>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input type="number" className={`${INPUT} pl-7 dark:bg-gray-900 dark:text-gray-100`} value={form.amount} aria-label="Amount in dollars"
                  onChange={set('amount')} placeholder="0.00" min="0.01" step="0.01" />
              </div>
              {errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount}</p>}
            </Field>
            <Field label="Vendor / Source">
              <input type="text" className={INPUT} value={form.vendor} aria-label="Vendor or source"
                onChange={set('vendor')} placeholder="Company or payer name" />
            </Field>
          </div>

          {/* Check number + Approved by */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Check / Reference #">
              <input type="text" className={INPUT} value={form.checkNumber} aria-label="Check or reference number"
                onChange={set('checkNumber')} placeholder="Check #, ACH, Grant ID…" />
            </Field>
            <Field label="Approved By">
              <input type="text" className={INPUT} value={form.approvedBy} aria-label="Approved by"
                onChange={set('approvedBy')} placeholder="Authorizing officer" />
            </Field>
          </div>

          {/* Notes */}
          <Field label="Notes">
            <DictateTextarea
              rows={2} value={form.notes} onChange={e => set('notes')(e.target.value)}
              placeholder="Optional context or conditions…" name="notes" id="budget-notes" />
          </Field>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
              Cancel
            </button>
            <button type="submit"
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-red-700 rounded-xl hover:bg-red-800 transition-colors">
              <Save size={14} />
              {isEdit ? 'Save Changes' : 'Add Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
