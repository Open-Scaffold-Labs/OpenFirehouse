import { useState, useEffect, useRef } from 'react';
import { X, Camera, Loader2, UserCircle2 } from 'lucide-react';
import { RANKS, ROLES, STATUSES } from '../data/members';
import DateDropdown from './DateDropdown';
import FieldTooltip from './FieldTooltip';
import DictateInput from './DictateInput';
import EmailTypeahead from './EmailTypeahead';
import { api } from '../utils/api';

// ── Headshot uploader ─────────────────────────────────────────────────────────
const CLOUD_NAME    = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

async function uploadHeadshot(file) {
  // Resize to max 400 px square, JPEG 0.88
  const img = new Image();
  const objUrl = URL.createObjectURL(file);
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = objUrl; });
  const MAX = 400;
  let { width, height } = img;
  if (width > MAX || height > MAX) {
    if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
    else                { width  = Math.round(width  * MAX / height); height = MAX; }
  }
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);
  URL.revokeObjectURL(objUrl);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.88));

  const fd = new FormData();
  fd.append('file', blob, 'headshot.jpg');
  fd.append('upload_preset', UPLOAD_PRESET);
  fd.append('folder', 'members');
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Upload failed (${res.status})`);
  return data.secure_url;
}

function AvatarUpload({ photoUrl, name, onChange, onLoadingChange }) {
  const inputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const initials = name ? name.split(' ').map((n) => n[0]).slice(0, 2).join('') : '?';

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!CLOUD_NAME || !UPLOAD_PRESET) { setErr('Cloudinary not configured.'); return; }
    setLoading(true); onLoadingChange?.(true); setErr(null);
    try {
      const url = await uploadHeadshot(file);
      onChange(url);
    } catch (err) { setErr(err.message || 'Upload failed. Try again.'); }
    finally { setLoading(false); onLoadingChange?.(false); e.target.value = ''; }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        {/* Avatar circle */}
        <div className="h-20 w-20 rounded-full overflow-hidden bg-red-700 flex items-center justify-center ring-2 ring-white shadow">
          {photoUrl
            ? <img src={photoUrl} alt="Headshot" className="h-full w-full object-cover" />
            : <span className="text-white text-xl font-bold">{initials}</span>}
        </div>
        {/* Camera button */}
        <button type="button" onClick={() => inputRef.current?.click()} disabled={loading}
          aria-label="Upload headshot photo"
          className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 shadow flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50">
          {loading ? <Loader2 size={13} className="animate-spin text-gray-500 dark:text-gray-400" /> : <Camera size={13} className="text-gray-600 dark:text-gray-300" />}
        </button>
      </div>
      {photoUrl && (
        <button type="button" onClick={() => onChange('')}
          className="text-xs text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">
          Remove photo
        </button>
      )}
      {!CLOUD_NAME && !err && (
        <p className="text-xs text-amber-600 dark:text-amber-400 text-center max-w-[160px] leading-tight">
          Add Cloudinary env vars to enable photo uploads
        </p>
      )}
      {err && <p className="text-xs text-red-500">{err}</p>}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

const emptyForm = {
  name: '',
  rank: 'Firefighter I',
  role: 'Operations',
  status: 'Active',
  joined: new Date().toISOString().slice(0, 10),
  certifications: [],
  memberNumber: '',
  dob: '',
  phone: '',
  station_email: '',
  personal_email: '',
  address: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  emergencyContactRelation: '',
  photo_url: '',
  hire_date: '',
  rank_date: '',
  seniority_number: '',
  employment_type: 'volunteer',
  assigned_unit_id: '',
  assigned_group: '',
};

const EMPLOYMENT_TYPES = ['volunteer', 'career', 'part-time', 'per-diem'];

const TABS = ['Basic Info', 'Contact', 'Emergency', 'Career'];

function Field({ label, required, error, tooltip, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        {tooltip && <FieldTooltip text={tooltip} />}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

function TextInput({ name, value, onChange, placeholder, type = 'text', error }) {
  if (type === 'text') {
    return (
      <DictateInput
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        id={name}
        className={`rounded-lg ${
          error ? 'ring-red-400 border-red-300 dark:border-red-700' : ''
        }`}
      />
    );
  }
  return (
    <input
      type={type}
      name={name}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 ${
        error ? 'border-red-400 bg-red-50 dark:bg-red-950/50' : 'border-gray-300 dark:border-gray-700 dark:bg-gray-900'
      }`}
    />
  );
}

export default function MemberForm({ member, onSave, onClose }) {
  const [form, setForm]                 = useState(emptyForm);
  const [certInput, setCertInput]       = useState('');
  const [errors, setErrors]             = useState({});
  const [activeTab, setActiveTab]       = useState('Basic Info');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [apparatusList, setApparatusList] = useState([]);
  const [stationList, setStationList]     = useState([]);

  // Apparatus for the standing-unit dropdown (chief assigns a member's crew).
  useEffect(() => {
    api.get('/api/apparatus').then((r) => setApparatusList(r?.data || [])).catch(() => {});
  }, []);
  // Stations for the HOME STATION dropdown (0073). Only meaningful multi-house:
  // a rider whose seat station ≠ home station is flagged as a DETAIL on the roster.
  useEffect(() => {
    api.get('/api/stations').then((r) => setStationList(r?.data || [])).catch(() => {});
  }, []);
  const isMultiHouse = stationList.length > 1;

  useEffect(() => {
    if (member) {
      const digits = (v) => (v ?? '').replace(/\D/g, '').slice(0, 10);
      const fmt    = (v) => { const d = digits(v); if (d.length <= 3) return d; if (d.length <= 6) return `${d.slice(0,3)}-${d.slice(3)}`; return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`; };
      setForm({ ...emptyForm, ...member, phone: fmt(member.phone), emergencyContactPhone: fmt(member.emergencyContactPhone) });
    } else {
      setForm(emptyForm);
    }
    setCertInput('');
    setErrors({});
    setActiveTab('Basic Info');
  }, [member]);

  const isEditing = Boolean(member);

  function validate() {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Full name is required.';
    if (!form.rank)        errs.rank = 'Rank is required.';
    if (!form.role)        errs.role = 'Role is required.';
    if (!form.joined)      errs.joined = 'Join date is required.';
    if (form.station_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.station_email))
      errs.station_email = 'Enter a valid station email address.';
    if (form.personal_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.personal_email))
      errs.personal_email = 'Enter a valid personal email address.';
    return errs;
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  // Auto-format phone fields as XXX-XXX-XXXX while typing
  function formatPhone(val) {
    const digits = val.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  function handlePhoneChange(e) {
    const { name } = e.target;
    const formatted = formatPhone(e.target.value);
    setForm((prev) => ({ ...prev, [name]: formatted }));
  }

  function addCert() {
    const cert = certInput.trim();
    if (cert && !form.certifications.includes(cert)) {
      setForm((prev) => ({ ...prev, certifications: [...prev.certifications, cert] }));
    }
    setCertInput('');
  }

  function removeCert(cert) {
    setForm((prev) => ({
      ...prev,
      certifications: prev.certifications.filter((c) => c !== cert),
    }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      // Jump to the tab that has errors
      if (errs.name || errs.rank || errs.role || errs.joined) setActiveTab('Basic Info');
      else if (errs.station_email || errs.personal_email) setActiveTab('Contact');
      return;
    }
    // Coerce the standing-assignment fields: '' → null (empty string would fail
    // the integer column / store a blank group). Number for the unit FK.
    // Home station rides a dedicated chief endpoint (0073), separate from the
    // main member write — persist it for an existing member on save.
    if (isEditing && isMultiHouse && member?.id) {
      api.patch(`/api/members/${member.id}/home-station`, {
        home_station_id: form.home_station_id === '' || form.home_station_id == null ? null : Number(form.home_station_id),
      }).catch(() => {});
    }
    onSave({
      ...form,
      assigned_unit_id: form.assigned_unit_id === '' || form.assigned_unit_id == null ? null : Number(form.assigned_unit_id),
      assigned_group: (form.assigned_group ?? '').trim() ? form.assigned_group.trim() : null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-red-700">
          <h2 className="text-lg font-semibold text-white">
            {isEditing ? 'Edit Member' : 'Add New Member'}
          </h2>
          <button onClick={onClose} className="text-red-200 hover:text-white transition-colors" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'text-red-700 dark:text-red-300 border-b-2 border-red-700 bg-white dark:bg-gray-900'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 max-h-[70vh] overflow-y-auto">

          {/* ── Tab: Basic Info ──────────────────────────────────────────── */}
          {activeTab === 'Basic Info' && (
            <div className="space-y-4">

              {/* Headshot */}
              <div className="flex justify-center pt-1 pb-2">
                <AvatarUpload
                  photoUrl={form.photo_url}
                  name={form.name}
                  onChange={(url) => setForm((prev) => ({ ...prev, photo_url: url }))}
                  onLoadingChange={setPhotoUploading}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Field label="Full Name" required error={errors.name}>
                    <TextInput name="name" value={form.name} onChange={handleChange}
                      placeholder="e.g. John A. Smith" error={errors.name} />
                  </Field>
                </div>

                <Field label="Member #" tooltip="Your department's internal ID for this member (e.g. MVF-032). Used on rosters, reports, and ID cards. Leave blank to auto-assign.">
                  <TextInput name="memberNumber" value={form.memberNumber} onChange={handleChange}
                    placeholder="e.g. MVF-032" />
                </Field>

                <Field label="Date of Birth">
                  <DateDropdown
                    value={form.dob}
                    onChange={(v) => setForm((p) => ({ ...p, dob: v }))}
                    selectClass="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-2 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500"
                    yearEnd={new Date().getFullYear() - 16}
                    yearStart={new Date().getFullYear() - 100}
                  />
                </Field>

                <Field label="Rank" required error={errors.rank} tooltip="The member's earned or appointed rank (e.g. Firefighter I, Lieutenant). Rank appears on rosters and incident reports.">
                  <select name="rank" value={form.rank} onChange={handleChange}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900">
                    {RANKS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Field>

                <Field label="Role" required error={errors.role} tooltip="Controls which modules this member can access. 'Operations' = standard firefighting access. 'Administration' = billing/payroll access. 'Command' = full officer access.">
                  <select name="role" value={form.role} onChange={handleChange}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900">
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Field>

                <Field label="Status" tooltip="Active = participates in incidents and training. Reserve = limited availability. Inactive = on leave or suspended. Retired = alumni record retained for history.">
                  <select name="status" value={form.status} onChange={handleChange}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900">
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>

                <Field label="Date Joined" required error={errors.joined}>
                  <DateDropdown
                    value={form.joined}
                    onChange={(v) => {
                      setForm((p) => ({ ...p, joined: v }));
                      if (errors.joined) setErrors((p) => ({ ...p, joined: undefined }));
                    }}
                    selectClass={`w-full rounded-lg border px-2 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 ${errors.joined ? 'border-red-400 bg-red-50 dark:bg-red-950/50' : 'border-gray-300 dark:border-gray-700'}`}
                    yearEnd={new Date().getFullYear()}
                    yearStart={new Date().getFullYear() - 60}
                    error={!!errors.joined}
                  />
                </Field>
              </div>

              {/* Certifications */}
              <Field label="Certifications" tooltip="Type a certification abbreviation (e.g. FF I, EMT-B, Hazmat Ops) and press Enter or Add. Each cert appears as a removable tag and shows on the member's record.">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={certInput}
                    onChange={(e) => setCertInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCert())}
                    placeholder="e.g. FF I, EMT-B — press Enter"
                    className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900"
                  />
                  <button type="button" onClick={addCert}
                    className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                    Add
                  </button>
                </div>
                {form.certifications.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {form.certifications.map((cert) => (
                      <span key={cert}
                        className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-300">
                        {cert}
                        <button type="button" onClick={() => removeCert(cert)}
                          className="text-gray-400 hover:text-red-500 transition-colors" aria-label={`Remove ${cert}`}>
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </Field>
            </div>
          )}

          {/* ── Tab: Contact ──────────────────────────────────────────────── */}
          {activeTab === 'Contact' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Cell Phone">
                  <TextInput type="tel" name="phone" value={form.phone} onChange={handlePhoneChange}
                    placeholder="555-867-5309" />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Station Email" error={errors.station_email}>
                  <EmailTypeahead
                    value={form.station_email}
                    onChange={(v) => {
                      setForm((prev) => ({ ...prev, station_email: v }));
                      if (errors.station_email) setErrors((prev) => ({ ...prev, station_email: undefined }));
                    }}
                    onSelect={(member) => {
                      if (errors.station_email) setErrors((prev) => ({ ...prev, station_email: undefined }));
                    }}
                    placeholder="Search by name or email..."
                    emailField="station_email"
                  />
                  {errors.station_email && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.station_email}</p>
                  )}
                </Field>

                <Field label="Personal Email" error={errors.personal_email}>
                  <EmailTypeahead
                    value={form.personal_email}
                    onChange={(v) => {
                      setForm((prev) => ({ ...prev, personal_email: v }));
                      if (errors.personal_email) setErrors((prev) => ({ ...prev, personal_email: undefined }));
                    }}
                    onSelect={(member) => {
                      if (errors.personal_email) setErrors((prev) => ({ ...prev, personal_email: undefined }));
                    }}
                    placeholder="Search by name or email..."
                    emailField="personal_email"
                  />
                  {errors.personal_email && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.personal_email}</p>
                  )}
                </Field>
              </div>

              <Field label="Home Address">
                <textarea
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  placeholder="Street, City, State ZIP"
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 resize-none dark:bg-gray-900"
                />
              </Field>

              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 px-4 py-3">
                <p className="text-xs text-blue-700 dark:text-blue-300 font-medium">Privacy note</p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                  Contact information is only visible to officers and administrators. Members see their own record in the Member Portal.
                </p>
              </div>
            </div>
          )}

          {/* ── Tab: Emergency Contact ────────────────────────────────────── */}
          {activeTab === 'Emergency' && (
            <div className="space-y-4">
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 px-4 py-3 mb-2">
                <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">Emergency Contact</p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                  This person will be notified in the event of a line-of-duty injury or emergency.
                </p>
              </div>

              <Field label="Contact Name">
                <TextInput name="emergencyContactName" value={form.emergencyContactName}
                  onChange={handleChange} placeholder="Full name" />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Phone Number">
                  <TextInput type="tel" name="emergencyContactPhone" value={form.emergencyContactPhone}
                    onChange={handlePhoneChange} placeholder="555-867-5309" />
                </Field>

                <Field label="Relationship">
                  <select
                    name="emergencyContactRelation"
                    value={form.emergencyContactRelation}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900"
                  >
                    <option value="">Select…</option>
                    {['Spouse', 'Partner', 'Parent', 'Father', 'Mother', 'Sibling', 'Child', 'Friend', 'Other'].map(r =>
                      <option key={r} value={r}>{r}</option>
                    )}
                  </select>
                </Field>
              </div>
            </div>
          )}

          {/* ── Tab: Career / Seniority ─────────────────────────────────── */}
          {activeTab === 'Career' && (
            <div className="space-y-4">
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 px-4 py-3 mb-2">
                <p className="text-xs text-blue-700 dark:text-blue-300 font-medium">Career & Seniority Information</p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                  Used for platoon scheduling, shift bidding, FLSA compliance, and promotional eligibility.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Employment Type" tooltip="Volunteer, career (full-time), part-time, or per-diem.">
                  <select name="employment_type" value={form.employment_type} onChange={handleChange}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900">
                    {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </Field>

                <Field label="Assigned Unit" tooltip="The member's standing unit/company (apparatus). For career crews, the unit + group together identify the crew an officer oversees.">
                  <select name="assigned_unit_id" value={form.assigned_unit_id ?? ''} onChange={handleChange}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900">
                    <option value="">— None / unassigned —</option>
                    {apparatusList.map((a) => <option key={a.id} value={a.id}>{a.designation}</option>)}
                  </select>
                </Field>

                <Field label="Assigned Group" tooltip="Standing platoon/group for career shift rotations (e.g. 1-4 or A/B/C). One officer per unit + group. Leave blank for volunteers.">
                  <TextInput name="assigned_group" value={form.assigned_group ?? ''}
                    onChange={handleChange} placeholder="e.g. 4  (blank for volunteers)" />
                </Field>

                {isMultiHouse && isEditing && (
                  <Field label="Home Station" tooltip="The member's home house. If they ride a seat at a DIFFERENT station on a given day, the roster flags them as a detail (move-up) from here. Set this after the member is created.">
                    <select name="home_station_id" value={form.home_station_id ?? ''} onChange={handleChange}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900">
                      <option value="">— No home station —</option>
                      {stationList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </Field>
                )}

                <Field label="Seniority Number" tooltip="Department-assigned seniority number. Lower = more senior. Used for shift bidding.">
                  <TextInput type="number" name="seniority_number" value={form.seniority_number}
                    onChange={handleChange} placeholder="e.g. 12" />
                </Field>

                <Field label="Hire Date" tooltip="Original date of hire. Used for time-in-service calculations.">
                  <input type="date" name="hire_date" value={form.hire_date} onChange={handleChange}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900" />
                </Field>

                <Field label="Current Rank Date" tooltip="Date the member achieved their current rank. Used for time-in-grade and promotional eligibility.">
                  <input type="date" name="rank_date" value={form.rank_date} onChange={handleChange}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900" />
                </Field>
              </div>
            </div>
          )}

          {/* ── Actions ───────────────────────────────────────────────────── */}
          <div className="flex gap-3 pt-5 mt-2 border-t border-gray-100 dark:border-gray-700">
            {activeTab !== 'Basic Info' && (
              <button type="button"
                onClick={() => setActiveTab(TABS[TABS.indexOf(activeTab) - 1])}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                ← Back
              </button>
            )}
            {activeTab !== 'Career' && (
              <button type="button"
                onClick={() => setActiveTab(TABS[TABS.indexOf(activeTab) + 1])}
                className={`${isEditing ? '' : 'flex-1 '} rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 transition-colors`}>
                Next →
              </button>
            )}
            {/* In edit mode, Save is always available; in add mode, only on the last tab */}
            {(isEditing || activeTab === 'Career') && (
              <>
                {!isEditing && (
                  <button type="button" onClick={onClose}
                    className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    Cancel
                  </button>
                )}
                <button type="submit" disabled={photoUploading}
                  className="flex-1 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                  {photoUploading ? 'Uploading photo…' : (isEditing ? 'Save Changes' : 'Add Member')}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
