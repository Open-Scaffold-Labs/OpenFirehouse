import { useState, useEffect } from 'react';
import { X, BookOpen, Save, Plus, Trash2 } from 'lucide-react';
import { SOG_CATEGORIES, SOG_STATUSES } from '../data/sogs';
import { api } from '../utils/api';
import AIWriteTextarea from './AIWriteTextarea';

const INPUT    = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100';
const TEXTAREA = `${INPUT} resize-none`;

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
  number:           '',
  title:            '',
  category:         'Operations',
  status:           'Active',
  version:          '1.0',
  effectiveDate:    new Date().toISOString().slice(0, 10),
  reviewDate:       '',
  lastReviewedDate: new Date().toISOString().slice(0, 10),
  author:           '',
  approvedBy:       '',
  summary:          '',
  content:          '',
  tags:             [],
};

export default function SOGForm({ record, onSave, onClose }) {
  const isEdit = Boolean(record?.id);

  const [form,   setForm]   = useState(() => ({
    ...BLANK,
    ...(isEdit ? record : {}),
    tags: isEdit ? [...(record.tags ?? [])] : [],
  }));
  const [errors, setErrors] = useState({});
  const [tagInput, setTagInput] = useState('');
  const [members, setMembers] = useState([]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    api.get('/api/members').then(raw => {
      const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      setMembers(arr.filter(m => m.status !== 'Inactive').sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => {});
  }, []);

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function addTag() {
    const t = tagInput.trim();
    if (!t || form.tags.includes(t)) { setTagInput(''); return; }
    setForm((f) => ({ ...f, tags: [...f.tags, t] }));
    setTagInput('');
  }

  function removeTag(tag) {
    setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }));
  }

  function validate() {
    const errs = {};
    if (!form.number?.trim())  errs.number  = 'SOG number required';
    if (!form.title?.trim())   errs.title   = 'Title required';
    if (!form.category)        errs.category = 'Select a category';
    if (!form.summary?.trim()) errs.summary  = 'Summary required';
    return errs;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSave({
      ...form,
      id:               record?.id,
      effectiveDate:    form.effectiveDate    || null,
      reviewDate:       form.reviewDate       || null,
      lastReviewedDate: form.lastReviewedDate || null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[94vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-red-600 dark:text-red-400" />
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
              {isEdit ? 'Edit SOG / Policy' : 'Add SOG / Policy'}
            </h2>
          </div>
          <button onClick={onClose}
            aria-label="Close"
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* Number + Version */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="SOG / Policy Number" required>
              <input type="text" className={INPUT} value={form.number}
                onChange={set('number')} placeholder="e.g. SOG-101" />
              {errors.number && <p className="text-xs text-red-500 mt-1">{errors.number}</p>}
            </Field>
            <Field label="Version">
              <input type="text" className={INPUT} value={form.version}
                onChange={set('version')} placeholder="e.g. 1.0" />
            </Field>
          </div>

          {/* Title */}
          <Field label="Title" required>
            <input type="text" className={INPUT} value={form.title}
              onChange={set('title')} placeholder="Full policy title" />
            {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
          </Field>

          {/* Category + Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Category" required>
              <select className={INPUT} value={form.category} onChange={set('category')}>
                {SOG_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {errors.category && <p className="text-xs text-red-500 mt-1">{errors.category}</p>}
            </Field>
            <Field label="Status">
              <select className={INPUT} value={form.status} onChange={set('status')}>
                {SOG_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          {/* Summary */}
          <Field label="Summary / Abstract" required>
            <AIWriteTextarea rows={2} value={form.summary}
              onChange={e => set('summary')(e.target.value)} placeholder="One or two sentence overview of this policy…" name="summary" id="sog-summary" />
            {errors.summary && <p className="text-xs text-red-500 mt-1">{errors.summary}</p>}
          </Field>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Effective Date">
              <input type="date" className={INPUT} value={form.effectiveDate ?? ''}
                onChange={set('effectiveDate')} />
            </Field>
            <Field label="Next Review Date">
              <input type="date" className={INPUT} value={form.reviewDate ?? ''}
                onChange={set('reviewDate')} />
            </Field>
            <Field label="Last Reviewed">
              <input type="date" className={INPUT} value={form.lastReviewedDate ?? ''}
                onChange={set('lastReviewedDate')} max={new Date().toISOString().slice(0, 10)} />
            </Field>
          </div>

          {/* Author + Approved By */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Author">
              <select className={INPUT} value={form.author} onChange={set('author')}>
                <option value="">— Select a member —</option>
                {members.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
              </select>
            </Field>
            <Field label="Approved By">
              <input type="text" className={INPUT} value={form.approvedBy ?? ''}
                onChange={set('approvedBy')} placeholder="Chief, Board, etc." />
            </Field>
          </div>

          {/* Tags */}
          <Field label="Tags">
            <div className="flex gap-2 mb-2">
              <input type="text" className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="Add a tag and press Enter…" />
              <button type="button" onClick={addTag}
                aria-label="Add tag"
                className="px-3 py-2 text-sm font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
                <Plus size={14} />
              </button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.tags.map((tag) => (
                  <span key={tag}
                    className="inline-flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-full pl-2.5 pr-1 py-0.5">
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)}
                      aria-label={`Remove tag ${tag}`}
                      className="hover:text-red-600 transition-colors">
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </Field>

          {/* Policy content */}
          <Field label="Full Policy Content">
            <AIWriteTextarea rows={12} value={form.content}
              onChange={e => set('content')(e.target.value)}
              placeholder="Paste or type the full policy text. You can use plain text with numbered sections." name="content" id="sog-content" />
            <p className="text-xs text-gray-400 mt-1">Plain text or numbered sections recommended.</p>
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
              {isEdit ? 'Save Changes' : 'Add SOG'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
