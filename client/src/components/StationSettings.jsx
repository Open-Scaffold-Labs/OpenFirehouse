import { useState, useEffect } from 'react';
import {
  Building2, Phone, Mail, Globe, User, MapPin, Hash,
  Shield, Clock, Save, RotateCcw, CheckCircle2, Info, Bell, Tv, Copy,
  Bot, Eye, EyeOff, KeyRound, Briefcase, AlertTriangle, Loader2,
  Radio, Package, ChevronDown,
} from 'lucide-react';
import { api } from '../utils/api';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../data/stationSettings';
import PushNotificationSetup from './PushNotificationSetup';
import RankNotificationSettings from './RankNotificationSettings';
import LicenseInfoCard from './LicenseInfoCard';

// ─── helpers ─────────────────────────────────────────────────────────────────

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];

const TIMEZONES = [
  { value: 'America/New_York',   label: 'Eastern (ET)'   },
  { value: 'America/Chicago',    label: 'Central (CT)'   },
  { value: 'America/Denver',     label: 'Mountain (MT)'  },
  { value: 'America/Phoenix',    label: 'Arizona (MT, no DST)' },
  { value: 'America/Los_Angeles',label: 'Pacific (PT)'   },
  { value: 'America/Anchorage',  label: 'Alaska (AKT)'   },
  { value: 'Pacific/Honolulu',   label: 'Hawaii (HT)'    },
];

// ─── sub-components ───────────────────────────────────────────────────────────

function Section({ icon: Icon, title, children }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
        <Icon size={16} className="text-red-600 dark:text-red-400" />
        <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">{title}</h2>
      </div>
      <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-5">
        {children}
      </div>
    </div>
  );
}

function Field({ label, hint, span, children }) {
  return (
    <div className={span === 2 ? 'md:col-span-2' : ''}>
      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

export default function StationSettings({ onSettingsChange }) {
  const [form, setForm]       = useState(() => loadSettings());
  const [saved, setSaved]     = useState(false);
  const [dirty, setDirty]     = useState(false);
  const [tvPin, setTvPin]     = useState(null);
  const [copied, setCopied]   = useState(false);

  // Generate random alphanumeric PIN in format XXXX-XXXX
  const generatePin = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let pin = '';
    for (let i = 0; i < 8; i++) {
      pin += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${pin.slice(0, 4)}-${pin.slice(4)}`;
  };

  // Career / Station config state (stored server-side via /api/station-config)
  const [careerConfig, setCareerConfig] = useState({
    dept_type: 'volunteer',
    flsa_work_period: 7,
    flsa_ot_threshold: 40,
    flsa_period_start: '',
    min_staffing_block: false,
  });
  const [careerLoading, setCareerLoading] = useState(true);
  const [careerSaving,  setCareerSaving]  = useState(false);
  const [careerSaved,   setCareerSaved]   = useState(false);

  useEffect(() => {
    api.get('/api/station-config')
      .then(res => { if (res?.data) setCareerConfig(prev => ({ ...prev, ...res.data })); })
      .catch(() => {})
      .finally(() => setCareerLoading(false));
  }, []);

  async function saveCareerConfig() {
    setCareerSaving(true);
    try {
      const res = await api.patch('/api/station-config', careerConfig);
      if (res?.data) setCareerConfig(prev => ({ ...prev, ...res.data }));
      setCareerSaved(true);
      setTimeout(() => setCareerSaved(false), 3000);
    } catch (err) {
      alert('Failed to save career config: ' + (err.message || 'Unknown error'));
    } finally {
      setCareerSaving(false);
    }
  }

  // AI Assistant API key state (stored server-side)
  const [aiKey,        setAiKey]        = useState('');
  const [aiKeyVisible, setAiKeyVisible] = useState(false);
  const [aiKeySaving,  setAiKeySaving]  = useState(false);
  const [aiKeySaved,   setAiKeySaved]   = useState(false);
  const [aiKeyError,   setAiKeyError]   = useState(null);
  const [aiKeySet,     setAiKeySet]     = useState(false);

  useEffect(() => {
    api.get('/api/assistant/key')
      .then((d) => { if (d) setAiKeySet(!!d.configured); })
      .catch(() => {});
  }, []);

  // Initialize TV PIN from server (source of truth)
  useEffect(() => {
    api.get('/api/stations/tv-pin')
      .then((d) => {
        const pin = d?.pin || d?.data?.pin || null;
        if (pin) {
          setTvPin(pin);
          localStorage.setItem('tv-display-pin', pin);
        }
      })
      .catch(() => {});
  }, []);

  function set(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
    setDirty(true);
    setSaved(false);
  }

  function handleSave(e) {
    e.preventDefault();
    saveSettings(form);
    setDirty(false);
    setSaved(true);
    onSettingsChange?.(form);
    setTimeout(() => setSaved(false), 3000);
  }

  function handleReset() {
    if (!window.confirm('Reset all settings to defaults? This cannot be undone.')) return;
    setForm({ ...DEFAULT_SETTINGS });
    saveSettings(DEFAULT_SETTINGS);
    onSettingsChange?.(DEFAULT_SETTINGS);
    setDirty(false);
    setSaved(false);
  }

  function regenerateTvPin() {
    const newPin = generatePin();
    localStorage.setItem('tv-display-pin', newPin);
    setTvPin(newPin);
    api.put('/api/stations/tv-pin', { pin: newPin }).catch(() => {});
  }

  const inp = (key, extra = {}) => ({
    value: form[key] ?? '',
    onChange: (e) => set(key, e.target.value),
    className: `w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm
      focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100 ${extra.className ?? ''}`,
    ...extra,
  });

  // live preview of top-bar display name
  const displayName = [form.stationName, form.departmentName].filter(Boolean).join(' · ');

  return (
    <div className="space-y-6">

      {/* ── License info (ADR-0001 Step 13) ── */}
      <LicenseInfoCard />

      {/* ── header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Station Settings</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Configure your department's profile, contact info, and operational defaults.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <RotateCcw size={14} /> Reset to Defaults
          </button>
          <button
            onClick={handleSave}
            className={`flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg transition-colors ${
              saved
                ? 'bg-emerald-600 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
          >
            {saved ? <><CheckCircle2 size={15} /> Saved!</> : <><Save size={15} /> Save Settings</>}
          </button>
        </div>
      </div>

      {/* ── live preview ── */}
      <div className="bg-red-700 rounded-xl px-5 py-3 flex items-center gap-3 shadow">
        <Shield size={20} className="text-white opacity-80 shrink-0" />
        <div>
          <p className="text-white font-bold text-base leading-tight">{displayName || 'Your Station Name'}</p>
          <p className="text-red-200 text-xs">{form.address ? `${form.address}, ${form.city}, ${form.state} ${form.zip}` : 'Address not set'}</p>
        </div>
        <span className="ml-auto text-red-300 text-xs italic">Top bar preview</span>
      </div>

      {/* ── unsaved warning ── */}
      {dirty && (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-lg text-sm text-amber-700 dark:text-amber-300">
          <Info size={15} className="shrink-0" />
          You have unsaved changes. Click <strong>Save Settings</strong> to apply them.
        </div>
      )}

      {/* ── station identity ── */}
      <Section icon={Building2} title="Station Identity">
        <Field label="Station Name" hint='Displayed in the top bar (e.g. "Station 14")'>
          <input {...inp('stationName')} placeholder="Station 14" />
        </Field>
        <Field label="Department Name" hint='Full department name (e.g. "Maplewood VFD")'>
          <input {...inp('departmentName')} placeholder="Maplewood VFD" />
        </Field>
        <Field label="Station Number">
          <input {...inp('stationNumber')} placeholder="14" />
        </Field>
        <Field label="Year Founded">
          <input {...inp('founded')} placeholder="1952" />
        </Field>
        <Field label="County">
          <input {...inp('county')} placeholder="Maplewood County" />
        </Field>
        <Field label="Fire District">
          <input {...inp('district')} placeholder="Fire District 3" />
        </Field>
        <Field label="FDID (NFIRS)" hint="Fire Department ID used for federal incident reporting">
          <input {...inp('fdid')} placeholder="PA-4214" />
        </Field>
      </Section>

      {/* ── address ── */}
      <Section icon={MapPin} title="Station Address">
        <Field label="Street Address" span={2}>
          <input {...inp('address')} placeholder="1400 Elm Street" />
        </Field>
        <Field label="City">
          <input {...inp('city')} placeholder="Maplewood" />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="State">
            <select
              value={form.state ?? ''}
              onChange={(e) => set('state', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100"
            >
              {US_STATES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="ZIP Code">
            <input {...inp('zip')} placeholder="17001" />
          </Field>
        </div>
      </Section>

      {/* ── contact ── */}
      <Section icon={Phone} title="Contact Information">
        <Field label="Station Phone">
          <div className="relative">
            <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input {...inp('phone', { className: 'pl-8' })} placeholder="(717) 555-0114" />
          </div>
        </Field>
        <Field label="Station Email">
          <div className="relative">
            <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input {...inp('email', { className: 'pl-8' })} type="email" placeholder="station14@maplewoodvfd.org" />
          </div>
        </Field>
        <Field label="Website" span={2}>
          <div className="relative">
            <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input {...inp('website', { className: 'pl-8' })} placeholder="www.maplewoodvfd.org" />
          </div>
        </Field>
      </Section>

      {/* ── chief / officer ── */}
      <Section icon={User} title="Fire Chief / Primary Contact">
        <Field label="Chief's Name">
          <input {...inp('chiefName')} placeholder="Full name" />
        </Field>
        <Field label="Chief's Phone">
          <div className="relative">
            <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input {...inp('chiefPhone', { className: 'pl-8' })} placeholder="(717) 555-0100" />
          </div>
        </Field>
        <Field label="Chief's Email" span={2}>
          <div className="relative">
            <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input {...inp('chiefEmail', { className: 'pl-8' })} type="email" placeholder="chief@maplewoodvfd.org" />
          </div>
        </Field>
      </Section>

      {/* ── operational defaults ── */}
      <Section icon={Clock} title="Operational Defaults">
        <Field label="Minimum Crew Size" hint="Minimum members required for a fully-staffed shift">
          <input
            type="number"
            min={1}
            max={20}
            {...inp('minCrewSize')}
            placeholder="3"
          />
        </Field>
        <Field label="Default Shift Length (hours)">
          <select
            value={form.shiftLength ?? 12}
            onChange={(e) => set('shiftLength', Number(e.target.value))}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100"
          >
            {[8, 10, 12, 16, 24].map((h) => (
              <option key={h} value={h}>{h} hours</option>
            ))}
          </select>
        </Field>
        <Field label="Time Zone" span={2}>
          <select
            value={form.timezone ?? 'America/New_York'}
            onChange={(e) => set('timezone', e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </Field>
      </Section>

      {/* ── NFIRS / IDs ── */}
      <Section icon={Hash} title="Identifiers & Reporting">
        <Field label="FDID" hint="Used in NFIRS incident exports">
          <input {...inp('fdid')} placeholder="PA-4214" />
        </Field>
        <Field label="Fire District">
          <input {...inp('district')} placeholder="Fire District 3" />
        </Field>
      </Section>

      {/* Mobile / Push Notifications */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
          <Bell size={16} className="text-red-600 dark:text-red-400" />
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Mobile Notifications</h2>
        </div>
        <div className="px-6 py-5">
          <PushNotificationSetup />
        </div>
      </div>

      {/* Notifications by Rank (chief-configurable; migration 0026) */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
          <Bell size={16} className="text-red-600 dark:text-red-400" />
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Notifications by Rank</h2>
        </div>
        <div className="px-6 py-5">
          <RankNotificationSettings />
        </div>
      </div>

      {/* ── TV Display — All Device Options ── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
          <Tv size={16} className="text-red-600 dark:text-red-400" />
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">TV Display Setup</h2>
        </div>
        <div className="px-6 py-5 space-y-5">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Open Firehouse includes a dedicated TV display designed for station day rooms. It shows live crew status, apparatus readiness, today's schedule, weather, and automatically switches to incident mode when the Command Board goes active. Zero interaction required — firefighters walk in, glance at the TV, and know everything about their day.
          </p>

          {tvPin ? (
            <div className="space-y-5">
              {/* TV URL + PIN Section */}
              <div className="bg-gray-900 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Your TV Display URL</p>
                  <span className="font-mono text-xs text-gray-500 dark:text-gray-400">PIN: {tvPin}</span>
                </div>
                <p className="text-sm font-mono text-green-400 break-all mb-4">
                  {window.location.origin}/tv?pin={tvPin}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/tv?pin=${tvPin}`);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
                  >
                    <Copy size={12} /> {copied ? 'Copied!' : 'Copy URL'}
                  </button>
                  <button
                    type="button"
                    onClick={regenerateTvPin}
                    className="flex items-center gap-1.5 bg-red-600/30 hover:bg-red-600/50 text-red-300 px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
                  >
                    <RotateCcw size={12} /> New PIN
                  </button>
                  <button
                    type="button"
                    onClick={() => window.open(`${window.location.origin}/tv?pin=${tvPin}`, '_blank')}
                    className="flex items-center gap-1.5 bg-green-600/40 hover:bg-green-600/60 text-green-300 px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
                  >
                    <Tv size={12} /> Launch TV Mode
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-2">This URL works on any device with a web browser. The PIN keeps the display private to your station.</p>
              </div>

              {/* ── Device Setup Guides ── */}
              <div>
                <p className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">Setup Guide by Device</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">All options use the same TV URL above. Pick whichever hardware you have or want to buy.</p>

                {/* Apple TV */}
                <details className="group border border-gray-200 dark:border-gray-700 rounded-xl mb-3 overflow-hidden">
                  <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer bg-gray-50 dark:bg-gray-950 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    <span className="text-lg">🍎</span>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Apple TV</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">Best for Apple-ecosystem stations · $129–$199</p>
                    </div>
                    <ChevronDown size={14} className="text-gray-400 group-open:rotate-180 transition-transform" />
                  </summary>
                  <div className="px-4 py-4 space-y-2 text-xs text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-700">
                    <p className="font-semibold text-gray-800 dark:text-gray-100">Requirements</p>
                    <p>Apple TV HD (4th gen) or Apple TV 4K. Any TV with HDMI input.</p>
                    <p className="font-semibold text-gray-800 dark:text-gray-100 mt-3">Setup Steps</p>
                    <ol className="list-decimal list-inside space-y-1.5 ml-1">
                      <li>Connect Apple TV to your TV via HDMI and to the station WiFi.</li>
                      <li>Open the <strong>Safari</strong> browser (or install any web browser from the App Store).</li>
                      <li>Enter the TV URL above (use the Apple TV remote's text entry, or AirPlay from your phone to type it).</li>
                      <li>Bookmark the page for easy access.</li>
                      <li>Go to <strong>Settings → General → Sleep After</strong> and set to <strong>Never</strong> to keep the display always on.</li>
                      <li>Optional: Use <strong>Guided Access</strong> (Settings → Accessibility) to lock the Apple TV into the browser app so nobody accidentally switches away.</li>
                    </ol>
                    <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-lg p-2.5 mt-3">
                      <p className="text-blue-800 dark:text-blue-300"><strong>Pro tip:</strong> AirPlay from an iPhone or Mac to type the URL more easily. You can also use the free "Remote" app on your iPhone to control the Apple TV.</p>
                    </div>
                  </div>
                </details>

                {/* Raspberry Pi */}
                <details className="group border border-gray-200 dark:border-gray-700 rounded-xl mb-3 overflow-hidden">
                  <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer bg-gray-50 dark:bg-gray-950 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    <span className="text-lg">🍓</span>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Raspberry Pi (Recommended)</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">Best budget option · Kiosk mode · $35–$80</p>
                    </div>
                    <ChevronDown size={14} className="text-gray-400 group-open:rotate-180 transition-transform" />
                  </summary>
                  <div className="px-4 py-4 space-y-2 text-xs text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-700">
                    <p className="font-semibold text-gray-800 dark:text-gray-100">Why Raspberry Pi?</p>
                    <p>This is our top recommendation for dedicated station displays. It's inexpensive, runs silently, boots directly into your TV display in kiosk mode, and auto-recovers from power outages. Many fire stations use them.</p>
                    <p className="font-semibold text-gray-800 dark:text-gray-100 mt-3">Requirements</p>
                    <p>Raspberry Pi 4 or Pi 5 (2GB+ RAM), micro SD card (16GB+), USB-C power supply, micro-HDMI to HDMI cable. Any TV with HDMI input.</p>
                    <p className="font-semibold text-gray-800 dark:text-gray-100 mt-3">Setup Steps</p>
                    <ol className="list-decimal list-inside space-y-1.5 ml-1">
                      <li>Flash <strong>Raspberry Pi OS Lite (64-bit)</strong> to the SD card using Raspberry Pi Imager.</li>
                      <li>Connect the Pi to your TV via HDMI and to the station network (WiFi or Ethernet).</li>
                      <li>Install Chromium browser: <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">sudo apt install chromium-browser</code></li>
                      <li>Create a kiosk startup script that launches Chromium in full-screen mode pointing to your TV URL.</li>
                      <li>Add the script to <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">/etc/xdg/lxsession/LXDE-pi/autostart</code> so it runs on boot.</li>
                      <li>Disable screen blanking: <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">sudo raspi-config</code> → Display Options → Screen Blanking → Off.</li>
                    </ol>
                    <div className="bg-gray-900 rounded-lg p-3 mt-3 font-mono text-[11px] text-green-400 leading-relaxed">
                      <p className="text-gray-500 dark:text-gray-400 mb-1"># Example kiosk autostart script</p>
                      <p>@xset s off</p>
                      <p>@xset -dpms</p>
                      <p>@xset s noblank</p>
                      <p>@chromium-browser --noerrdialogs --disable-infobars \</p>
                      <p className="ml-4">--kiosk {window.location.origin}/tv?pin={tvPin}</p>
                    </div>
                    <div className="bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900 rounded-lg p-2.5 mt-3">
                      <p className="text-green-800 dark:text-green-300"><strong>Power recovery:</strong> The Pi auto-boots when power returns after an outage, and the kiosk script restarts Chromium automatically. No manual intervention needed.</p>
                    </div>
                  </div>
                </details>

                {/* Amazon Fire TV Stick */}
                <details className="group border border-gray-200 dark:border-gray-700 rounded-xl mb-3 overflow-hidden">
                  <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer bg-gray-50 dark:bg-gray-950 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    <span className="text-lg">🔥</span>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Amazon Fire TV Stick</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">Easy plug-and-play · $30–$50</p>
                    </div>
                    <ChevronDown size={14} className="text-gray-400 group-open:rotate-180 transition-transform" />
                  </summary>
                  <div className="px-4 py-4 space-y-2 text-xs text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-700">
                    <p className="font-semibold text-gray-800 dark:text-gray-100">Requirements</p>
                    <p>Amazon Fire TV Stick (any model). Any TV with HDMI. Station WiFi.</p>
                    <p className="font-semibold text-gray-800 dark:text-gray-100 mt-3">Setup Steps</p>
                    <ol className="list-decimal list-inside space-y-1.5 ml-1">
                      <li>Plug the Fire TV Stick into your TV's HDMI port and connect to station WiFi.</li>
                      <li>Install <strong>Amazon Silk Browser</strong> from the Fire TV app store (it's free and pre-installed on most models).</li>
                      <li>Open Silk Browser and enter the TV URL above.</li>
                      <li>Bookmark the page. You can set it as the Silk homepage under browser settings.</li>
                      <li>Go to <strong>Settings → Display & Sounds → Screen Saver → Start Time</strong> and set to <strong>Never</strong>.</li>
                      <li>Optional: Install the free <strong>"Fully Kiosk Browser"</strong> app for more robust kiosk features (auto-restart, screen dimming on schedule, wake-on-motion).</li>
                    </ol>
                    <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-lg p-2.5 mt-3">
                      <p className="text-amber-800 dark:text-amber-300"><strong>Note:</strong> The Silk browser works well for basic use. For a dedicated 24/7 display, we recommend Fully Kiosk Browser ($7.90 one-time) — it auto-relaunches after crashes and can dim the screen on a schedule to extend TV life.</p>
                    </div>
                  </div>
                </details>

                {/* Google Chromecast */}
                <details className="group border border-gray-200 dark:border-gray-700 rounded-xl mb-3 overflow-hidden">
                  <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer bg-gray-50 dark:bg-gray-950 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    <span className="text-lg">📡</span>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Google Chromecast / Google TV</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">Cast from any device · $30–$50</p>
                    </div>
                    <ChevronDown size={14} className="text-gray-400 group-open:rotate-180 transition-transform" />
                  </summary>
                  <div className="px-4 py-4 space-y-2 text-xs text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-700">
                    <p className="font-semibold text-gray-800 dark:text-gray-100">Requirements</p>
                    <p>Chromecast with Google TV (recommended) or classic Chromecast. Any TV with HDMI.</p>
                    <p className="font-semibold text-gray-800 dark:text-gray-100 mt-3">Option A: Chromecast with Google TV (built-in browser)</p>
                    <ol className="list-decimal list-inside space-y-1.5 ml-1">
                      <li>Plug in the Chromecast and connect to station WiFi.</li>
                      <li>Sideload or install a web browser (Chrome is not included by default — install <strong>"TV Bro"</strong> or sideload Chrome via <strong>"Downloader"</strong> app).</li>
                      <li>Open the browser and navigate to your TV URL. Bookmark it.</li>
                      <li>Go to Settings → System → Screen saver → Start time: <strong>Never</strong>.</li>
                    </ol>
                    <p className="font-semibold text-gray-800 dark:text-gray-100 mt-3">Option B: Cast a Chrome tab from a station computer</p>
                    <ol className="list-decimal list-inside space-y-1.5 ml-1">
                      <li>On a station computer, open Chrome and navigate to the TV URL.</li>
                      <li>Click the three-dot menu → <strong>Save and share → Cast…</strong></li>
                      <li>Select your Chromecast. The tab will mirror to the TV.</li>
                      <li>The computer must stay on and connected for this to work.</li>
                    </ol>
                    <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-lg p-2.5 mt-3">
                      <p className="text-blue-800 dark:text-blue-300"><strong>Recommendation:</strong> Chromecast with Google TV running a browser directly is better than tab casting. Tab casting depends on the source computer staying on and can have slight lag.</p>
                    </div>
                  </div>
                </details>

                {/* Smart TV Built-in Browser */}
                <details className="group border border-gray-200 dark:border-gray-700 rounded-xl mb-3 overflow-hidden">
                  <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer bg-gray-50 dark:bg-gray-950 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    <span className="text-lg">📺</span>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Smart TV Built-in Browser</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">No extra hardware needed · Samsung, LG, Vizio, etc.</p>
                    </div>
                    <ChevronDown size={14} className="text-gray-400 group-open:rotate-180 transition-transform" />
                  </summary>
                  <div className="px-4 py-4 space-y-2 text-xs text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-700">
                    <p className="font-semibold text-gray-800 dark:text-gray-100">Requirements</p>
                    <p>Any Smart TV from 2018 or later with a built-in web browser (Samsung, LG, Sony, Vizio, Hisense, TCL all include one). Station WiFi.</p>
                    <p className="font-semibold text-gray-800 dark:text-gray-100 mt-3">Setup Steps</p>
                    <ol className="list-decimal list-inside space-y-1.5 ml-1">
                      <li>Connect your Smart TV to the station WiFi network.</li>
                      <li>Open the TV's built-in web browser (usually in the app drawer or home screen).</li>
                      <li>Enter the TV URL above. Bookmark it for quick access.</li>
                      <li>Most Smart TVs have a "Set as Homepage" option — use it so the display loads on browser launch.</li>
                      <li>Disable screen saver / auto-sleep in the TV's settings menu.</li>
                    </ol>
                    <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-lg p-2.5 mt-3">
                      <p className="text-amber-800 dark:text-amber-300"><strong>Limitations:</strong> Smart TV browsers are often underpowered and may not auto-refresh reliably over 24+ hours. They can also be slow to render. For a dedicated 24/7 display, a Raspberry Pi or Fire TV Stick plugged into the same TV is more reliable. The built-in browser works fine for occasional or shift-based viewing.</p>
                    </div>
                  </div>
                </details>

                {/* Old Laptop / Mini PC */}
                <details className="group border border-gray-200 dark:border-gray-700 rounded-xl mb-3 overflow-hidden">
                  <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer bg-gray-50 dark:bg-gray-950 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    <span className="text-lg">💻</span>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Old Laptop or Mini PC</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">Repurpose existing hardware · Free</p>
                    </div>
                    <ChevronDown size={14} className="text-gray-400 group-open:rotate-180 transition-transform" />
                  </summary>
                  <div className="px-4 py-4 space-y-2 text-xs text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-700">
                    <p className="font-semibold text-gray-800 dark:text-gray-100">Why this works</p>
                    <p>An old laptop or mini PC (Intel NUC, etc.) running Chrome in kiosk mode is essentially the same as a Raspberry Pi — but you might already have one sitting in a closet. Connect it to the TV via HDMI and you're done.</p>
                    <p className="font-semibold text-gray-800 dark:text-gray-100 mt-3">Setup Steps (Windows)</p>
                    <ol className="list-decimal list-inside space-y-1.5 ml-1">
                      <li>Connect the laptop/PC to the TV via HDMI.</li>
                      <li>Install Chrome and create a shortcut with the flag: <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">--kiosk {window.location.origin}/tv?pin={tvPin}</code></li>
                      <li>Place the shortcut in the Windows Startup folder (<code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">shell:startup</code>).</li>
                      <li>Set Windows to auto-login, disable sleep, and disable the lock screen.</li>
                      <li>Set the TV as the primary display in Display Settings.</li>
                    </ol>
                    <p className="font-semibold text-gray-800 dark:text-gray-100 mt-3">Setup Steps (Mac)</p>
                    <ol className="list-decimal list-inside space-y-1.5 ml-1">
                      <li>Connect the Mac to the TV via HDMI (or USB-C adapter).</li>
                      <li>Open Chrome and navigate to the TV URL.</li>
                      <li>Press <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">Cmd+Shift+F</code> for full-screen mode.</li>
                      <li>Add Chrome to Login Items (System Settings → General → Login Items) so it opens on boot.</li>
                      <li>Disable sleep in Energy Saver settings.</li>
                    </ol>
                    <div className="bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900 rounded-lg p-2.5 mt-3">
                      <p className="text-green-800 dark:text-green-300"><strong>Bonus:</strong> If the laptop has a webcam, you can double-purpose it as a station camera for remote monitoring. Close the laptop lid (set "close lid action" to "do nothing") and tuck it behind the TV.</p>
                    </div>
                  </div>
                </details>

                {/* HDMI Wireless Adapter */}
                <details className="group border border-gray-200 dark:border-gray-700 rounded-xl mb-3 overflow-hidden">
                  <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer bg-gray-50 dark:bg-gray-950 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    <span className="text-lg">📶</span>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Wireless Display Adapter (Miracast / AirPlay)</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">Mirror from phone or tablet · $20–$40</p>
                    </div>
                    <ChevronDown size={14} className="text-gray-400 group-open:rotate-180 transition-transform" />
                  </summary>
                  <div className="px-4 py-4 space-y-2 text-xs text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-700">
                    <p className="font-semibold text-gray-800 dark:text-gray-100">How it works</p>
                    <p>A wireless display adapter (Microsoft Wireless Display Adapter, AnyCast, or similar) plugs into your TV's HDMI port and receives a screen mirror from a phone, tablet, or computer. Open the TV URL on the source device and cast the screen to the adapter.</p>
                    <p className="font-semibold text-gray-800 dark:text-gray-100 mt-3">When to use this</p>
                    <p>This is best for <strong>temporary displays</strong> — training nights, open houses, or special events. It's not ideal for 24/7 use because the source device must stay on and connected. For permanent station displays, use one of the dedicated options above.</p>
                    <p className="font-semibold text-gray-800 dark:text-gray-100 mt-3">Protocols supported</p>
                    <ul className="list-disc list-inside space-y-1 ml-1">
                      <li><strong>AirPlay:</strong> iPhone, iPad, Mac → Apple TV or AirPlay-compatible adapter</li>
                      <li><strong>Miracast:</strong> Windows, Android → Miracast adapter (most wireless HDMI dongles)</li>
                      <li><strong>Google Cast:</strong> Chrome browser → Chromecast</li>
                    </ul>
                  </div>
                </details>
              </div>

              {/* Comparison Table */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <div className="bg-gray-50 dark:bg-gray-950 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                  <p className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Quick Comparison</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-950 text-gray-600 dark:text-gray-300">
                        <th className="text-left px-3 py-2 font-bold">Device</th>
                        <th className="text-left px-3 py-2 font-bold">Cost</th>
                        <th className="text-left px-3 py-2 font-bold">24/7 Ready</th>
                        <th className="text-left px-3 py-2 font-bold">Kiosk Mode</th>
                        <th className="text-left px-3 py-2 font-bold">Auto-Recovery</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      <tr className="bg-green-50 dark:bg-green-950/50">
                        <td className="px-3 py-2 font-bold text-gray-800 dark:text-gray-100">🍓 Raspberry Pi</td>
                        <td className="px-3 py-2">$35–$80</td>
                        <td className="px-3 py-2 text-green-700 dark:text-green-300 font-bold">Excellent</td>
                        <td className="px-3 py-2 text-green-700 dark:text-green-300 font-bold">Native</td>
                        <td className="px-3 py-2 text-green-700 dark:text-green-300 font-bold">Auto-boot</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-bold text-gray-800 dark:text-gray-100">🔥 Fire TV Stick</td>
                        <td className="px-3 py-2">$30–$50</td>
                        <td className="px-3 py-2 text-green-700 dark:text-green-300 font-bold">Good</td>
                        <td className="px-3 py-2 text-amber-600 dark:text-amber-400">With Fully Kiosk</td>
                        <td className="px-3 py-2 text-green-700 dark:text-green-300 font-bold">Auto-boot</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-bold text-gray-800 dark:text-gray-100">🍎 Apple TV</td>
                        <td className="px-3 py-2">$129–$199</td>
                        <td className="px-3 py-2 text-green-700 dark:text-green-300 font-bold">Good</td>
                        <td className="px-3 py-2 text-amber-600 dark:text-amber-400">Guided Access</td>
                        <td className="px-3 py-2 text-green-700 dark:text-green-300 font-bold">Auto-boot</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-bold text-gray-800 dark:text-gray-100">📡 Chromecast w/ Google TV</td>
                        <td className="px-3 py-2">$30–$50</td>
                        <td className="px-3 py-2 text-amber-600 dark:text-amber-400">Moderate</td>
                        <td className="px-3 py-2 text-amber-600 dark:text-amber-400">With sideload</td>
                        <td className="px-3 py-2 text-green-700 dark:text-green-300 font-bold">Auto-boot</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-bold text-gray-800 dark:text-gray-100">📺 Smart TV Browser</td>
                        <td className="px-3 py-2 text-green-700 dark:text-green-300 font-bold">Free</td>
                        <td className="px-3 py-2 text-red-600 dark:text-red-400">Limited</td>
                        <td className="px-3 py-2 text-red-600 dark:text-red-400">None</td>
                        <td className="px-3 py-2 text-amber-600 dark:text-amber-400">Manual</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-bold text-gray-800 dark:text-gray-100">💻 Old Laptop/PC</td>
                        <td className="px-3 py-2 text-green-700 dark:text-green-300 font-bold">Free</td>
                        <td className="px-3 py-2 text-green-700 dark:text-green-300 font-bold">Excellent</td>
                        <td className="px-3 py-2 text-green-700 dark:text-green-300 font-bold">Native</td>
                        <td className="px-3 py-2 text-green-700 dark:text-green-300 font-bold">Auto-boot</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Display Features */}
              <div className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                <p className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">What the TV Display Shows</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300">
                  <div className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">●</span>
                    <span><strong>Live clock</strong> with station name and date</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">●</span>
                    <span><strong>On-duty crew</strong> with rank and status</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">●</span>
                    <span><strong>Apparatus status</strong> — green/amber/red</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">●</span>
                    <span><strong>Today's schedule</strong> — events, training, meetings</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">●</span>
                    <span><strong>Live weather</strong> with wind speed and fire weather alerts</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">●</span>
                    <span><strong>AI briefing</strong> — rotating actionable insights</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">●</span>
                    <span><strong>Readiness scorecard</strong> — staffing, apparatus, training, budget</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-red-500 mt-0.5">●</span>
                    <span><strong>Incident mode</strong> — auto-switches when Command Board goes active</span>
                  </div>
                </div>
              </div>

              {/* Troubleshooting */}
              <details className="group border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer bg-gray-50 dark:bg-gray-950 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <AlertTriangle size={14} className="text-amber-500" />
                  <span className="text-sm font-bold text-gray-800 dark:text-gray-100 flex-1">Troubleshooting</span>
                  <ChevronDown size={14} className="text-gray-400 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="px-4 py-4 space-y-3 text-xs text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-700">
                  <div>
                    <p className="font-bold text-gray-800 dark:text-gray-100">Display shows "No TV PIN provided"</p>
                    <p>The URL is missing the <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">?pin=XXXX-XXXX</code> parameter. Copy the full URL from above, including the pin.</p>
                  </div>
                  <div>
                    <p className="font-bold text-gray-800 dark:text-gray-100">Display shows "Connection Error"</p>
                    <p>The device can't reach the Open Firehouse server. Check that the device is on the same WiFi network or has internet access. Verify the server is running.</p>
                  </div>
                  <div>
                    <p className="font-bold text-gray-800 dark:text-gray-100">Screen goes black after a while</p>
                    <p>The device's screensaver or sleep mode kicked in. Disable sleep/screen saver in the device settings (see setup steps above for your specific device).</p>
                  </div>
                  <div>
                    <p className="font-bold text-gray-800 dark:text-gray-100">Display seems frozen or stale</p>
                    <p>The TV display auto-refreshes every 15–60 seconds. If it appears frozen, the browser may have crashed. Restart the browser or reboot the device. For Raspberry Pi, the kiosk autostart script handles this automatically.</p>
                  </div>
                  <div>
                    <p className="font-bold text-gray-800 dark:text-gray-100">Incident mode didn't activate</p>
                    <p>Incident mode triggers when an active incident exists on the Command Board. Make sure the incident was created through the Command Board (not just the Incident Log). The TV checks every 15 seconds.</p>
                  </div>
                </div>
              </details>
            </div>
          ) : (
            <p className="text-xs text-gray-400">Initializing TV PIN…</p>
          )}
        </div>
      </div>

      {/* ── Radio Integration ── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
          <Radio size={16} className="text-red-600 dark:text-red-400" />
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Radio Integration</h2>
        </div>
        <div className="px-6 py-5 space-y-5">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Open Firehouse can display live radio communications on The Board, the Command Board during incidents, and the TV Display. Radio traffic is captured by station hardware (SDR receiver), transcribed by AI, and streamed to all connected displays in real time.
          </p>

          <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-xl p-4">
            <p className="text-xs font-bold text-blue-800 dark:text-blue-300 mb-2">How Radio Integration Works</p>
            <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1.5">
              <p>1. An RTL-SDR USB dongle + Raspberry Pi at the station captures your radio frequencies.</p>
              <p>2. Trunk Recorder decodes P25/analog transmissions into individual audio files.</p>
              <p>3. OpenAI Whisper transcribes the audio to text with timestamps and talkgroup IDs.</p>
              <p>4. The Pi sends transcriptions to Open Firehouse via the Radio Ingest API.</p>
              <p>5. All Board, Command Board, and TV displays update in real time via WebSocket.</p>
            </div>
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl p-4">
            <p className="text-xs font-bold text-amber-800 dark:text-amber-300 mb-1">Coming Soon — Hardware Setup Guide</p>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              The station hardware kit (RTL-SDR + Raspberry Pi + antenna, ~$140 total) and one-click installer are being developed. For now, you can test radio features using the Simulate button on The Board or the Radio Log page.
            </p>
          </div>

          {/* API Key for station hardware */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Radio Ingest API Key</label>
            <p className="text-xs text-gray-500 dark:text-gray-400">Station hardware uses this key to authenticate when sending transcribed radio messages. The Pi sends POST requests to <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-[11px]">/api/radio-ingest</code> with header <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-[11px]">X-Radio-API-Key</code>.</p>
            <div className="bg-gray-900 rounded-lg p-3 font-mono text-sm text-green-400 flex items-center justify-between gap-2">
              <span className="text-gray-500 dark:text-gray-400 select-none">Key: </span>
              <span className="flex-1 select-all">Configure in Radio Config API (PUT /api/radio/config)</span>
            </div>
          </div>

          {/* Where radio appears */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Where Radio Appears</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-gray-50 dark:bg-gray-950 rounded-xl p-3 border border-gray-200 dark:border-gray-700">
                <p className="text-xs font-bold text-gray-800 dark:text-gray-100">The Board</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Scrolling feed of all radio traffic between the Crew Board and River Timeline. Shows talkgroup badges, timestamps, and priority indicators.</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-950 rounded-xl p-3 border border-gray-200 dark:border-gray-700">
                <p className="text-xs font-bold text-gray-800 dark:text-gray-100">Command Board</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Live radio panel integrated into the incident control screen. All tactical and dispatch traffic visible during active incidents alongside unit tracking and personnel accountability.</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-950 rounded-xl p-3 border border-gray-200 dark:border-gray-700">
                <p className="text-xs font-bold text-gray-800 dark:text-gray-100">TV Display</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Ticker bar at the bottom of the wall display showing the last 5 radio transmissions. Updates in real time via WebSocket — no polling delay.</p>
              </div>
            </div>
          </div>

          {/* Hardware shopping list */}
          <details className="group border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer bg-gray-50 dark:bg-gray-950 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <Package size={14} className="text-blue-500" />
              <span className="text-sm font-bold text-gray-800 dark:text-gray-100 flex-1">Hardware Shopping List (~$140/station)</span>
              <ChevronDown size={14} className="text-gray-400 group-open:rotate-180 transition-transform" />
            </summary>
            <div className="px-4 py-4 space-y-2 text-xs text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-700">
              <div className="flex justify-between"><span className="font-bold">RTL-SDR Blog V4 USB Dongle</span><span>~$36</span></div>
              <div className="flex justify-between"><span className="font-bold">Raspberry Pi 5 (4GB)</span><span>~$60</span></div>
              <div className="flex justify-between"><span className="font-bold">Discone or whip antenna</span><span>~$15–30</span></div>
              <div className="flex justify-between"><span className="font-bold">64GB MicroSD card</span><span>~$10</span></div>
              <div className="flex justify-between"><span className="font-bold">Power supply + case</span><span>~$15</span></div>
              <div className="border-t border-gray-200 dark:border-gray-700 mt-2 pt-2 flex justify-between font-bold text-gray-800 dark:text-gray-100">
                <span>Total per Station</span><span>~$136–$175</span>
              </div>
              <p className="text-gray-500 dark:text-gray-400 mt-2">The Raspberry Pi can double as your TV display kiosk, serving both functions from a single device.</p>
            </div>
          </details>
        </div>
      </div>

      {/* ── Career & Staffing Configuration ── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
          <div className="flex items-center gap-3">
            <Briefcase size={16} className="text-red-600 dark:text-red-400" />
            <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Career & Staffing Configuration</h2>
          </div>
          {careerConfig.dept_type !== 'volunteer' && (
            <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 px-2 py-0.5 rounded-full">
              CAREER MODE
            </span>
          )}
        </div>
        <div className="px-6 py-5 space-y-5">
          {careerLoading ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Loader2 size={14} className="animate-spin" /> Loading career config…
            </div>
          ) : (
            <>
              {/* Dept Type */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Field label="Department Type" hint="Controls which career features are visible. 'Volunteer' hides FLSA/platoon features.">
                  <select
                    value={careerConfig.dept_type}
                    onChange={e => setCareerConfig(c => ({ ...c, dept_type: e.target.value }))}
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300 dark:text-gray-100"
                  >
                    <option value="volunteer">Volunteer</option>
                    <option value="career">Career (Paid)</option>
                    <option value="combination">Combination</option>
                    <option value="industrial">Industrial</option>
                  </select>
                </Field>

                <Field label="Minimum Staffing Hard-Block" hint="When ON, shifts below minimum crew cannot be saved.">
                  <button
                    type="button"
                    onClick={() => setCareerConfig(c => ({ ...c, min_staffing_block: !c.min_staffing_block }))}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                      careerConfig.min_staffing_block
                        ? 'bg-red-600 text-white border-red-600'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <Shield size={14} />
                    {careerConfig.min_staffing_block ? 'Hard-Block ENABLED' : 'Hard-Block Off (warnings only)'}
                  </button>
                </Field>
              </div>

              {/* FLSA Section — only show for career/combination */}
              {(careerConfig.dept_type === 'career' || careerConfig.dept_type === 'combination') && (
                <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-xl p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-blue-700 dark:text-blue-300" />
                    <p className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wide">FLSA §207(k) Work Period</p>
                  </div>
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    The FLSA allows fire departments to use work periods of 7–28 days for overtime calculation instead of the standard 40hr/week.
                    Configure your work period length, OT threshold, and anchor date below.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Work Period (days)</label>
                      <select
                        value={careerConfig.flsa_work_period}
                        onChange={e => setCareerConfig(c => ({ ...c, flsa_work_period: parseInt(e.target.value) }))}
                        className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:text-gray-100"
                      >
                        {[7, 14, 21, 28].map(d => (
                          <option key={d} value={d}>{d} days{d === 7 ? ' (standard week)' : d === 28 ? ' (most common for fire)' : ''}</option>
                        ))}
                      </select>
                      <p className="text-[10px] text-gray-400 mt-1">FLSA §207(k) allows 7–28 day periods</p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">OT Threshold (hours)</label>
                      <input
                        type="number"
                        min={40}
                        max={212}
                        value={careerConfig.flsa_ot_threshold}
                        onChange={e => setCareerConfig(c => ({ ...c, flsa_ot_threshold: parseFloat(e.target.value) || 40 }))}
                        className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:text-gray-100"
                      />
                      <p className="text-[10px] text-gray-400 mt-1">
                        FLSA max: {careerConfig.flsa_work_period === 28 ? '212' : careerConfig.flsa_work_period === 14 ? '106' : '53'}h for {careerConfig.flsa_work_period}-day period
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Period Start (anchor)</label>
                      <input
                        type="date"
                        value={careerConfig.flsa_period_start}
                        onChange={e => setCareerConfig(c => ({ ...c, flsa_period_start: e.target.value }))}
                        className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:text-gray-100"
                      />
                      <p className="text-[10px] text-gray-400 mt-1">The date your first FLSA work period began</p>
                    </div>
                  </div>

                  {careerConfig.min_staffing_block && (
                    <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
                      <AlertTriangle size={12} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-[10px] text-red-700 dark:text-red-300">
                        Hard-block mode is active. Officers will not be able to save shifts with fewer crew than the minimum. Make sure your minimum crew setting (in the schedule) is correct before enabling this.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Save button */}
              <div className="flex justify-end">
                <button
                  onClick={saveCareerConfig}
                  disabled={careerSaving}
                  className={`flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg transition-colors ${
                    careerSaved
                      ? 'bg-emerald-600 text-white'
                      : 'bg-red-600 hover:bg-red-700 text-white disabled:opacity-50'
                  }`}
                >
                  {careerSaved ? <><CheckCircle2 size={14} /> Saved!</> : careerSaving ? 'Saving…' : <><Save size={14} /> Save Career Config</>}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── AI Assistant ── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
          <Bot size={16} className="text-red-600 dark:text-red-400" />
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">AI Assistant</h2>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Anthropic API Key
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={aiKeyVisible ? 'text' : 'password'}
                  value={aiKey}
                  onChange={(e) => { setAiKey(e.target.value); setAiKeySaved(false); setAiKeyError(null); }}
                  placeholder={aiKeySet ? '••••••••••••••••••••••••••••••••' : 'sk-ant-api03-...'}
                  className="w-full pl-9 pr-10 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100"
                />
                <button
                  type="button"
                  onClick={() => setAiKeyVisible((v) => !v)}
                  aria-label={aiKeyVisible ? 'Hide API key' : 'Show API key'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {aiKeyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <button
                type="button"
                disabled={aiKeySaving || !aiKey.trim()}
                onClick={async () => {
                  setAiKeySaving(true);
                  setAiKeyError(null);
                  try {
                    await api.post('/api/assistant/key', { key: aiKey.trim() });
                    setAiKeySaved(true);
                    setAiKeySet(true);
                    setAiKey('');
                    setTimeout(() => setAiKeySaved(false), 3000);
                  } catch (err) {
                    setAiKeyError(err.message || 'Failed to save key');
                  } finally {
                    setAiKeySaving(false);
                  }
                }}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  aiKeySaved
                    ? 'bg-emerald-600 text-white'
                    : 'bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white'
                }`}
              >
                {aiKeySaved ? <><CheckCircle2 size={14} className="inline mr-1" />Saved</> : aiKeySaving ? 'Saving…' : 'Save Key'}
              </button>
            </div>
            {aiKeyError && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{aiKeyError}</p>}
            <p className="text-xs text-gray-400 mt-1.5">
              {aiKeySet
                ? 'A key is currently configured. Enter a new key above to replace it.'
                : 'No key configured. Get one at '}
              {!aiKeySet && (
                <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-red-600 dark:text-red-400 underline">console.anthropic.com</a>
              )}
              {!aiKeySet && '. The key is stored securely on the server — never sent to the browser.'}
            </p>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Powers the AI Assistant chat widget — answers questions about OpenFirehouse features, NFIRS codes, LOSAP rules, and NJ certification requirements. Uses Claude Haiku (fast, low cost).
          </p>
        </div>
      </div>

      {/* bottom save bar */}
      <div className="flex justify-end gap-3 pb-4">
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <RotateCcw size={14} /> Reset to Defaults
        </button>
        <button
          onClick={handleSave}
          className={`flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg transition-colors ${
            saved ? 'bg-emerald-600 text-white' : 'bg-red-600 hover:bg-red-700 text-white'
          }`}
        >
          {saved ? <><CheckCircle2 size={15} /> Saved!</> : <><Save size={15} /> Save Settings</>}
        </button>
      </div>

    </div>
  );
}
