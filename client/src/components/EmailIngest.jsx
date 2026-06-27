import { useState, useEffect } from 'react';
import {
  Mail, Upload, FileText, CheckCircle2, AlertTriangle, ArrowRight,
  Loader2, Trash2, Eye, ChevronDown, ChevronUp, Copy, Check,
} from 'lucide-react';
import { api } from '../utils/api';

// Module icons and colors
const MODULE_ICONS = {
  'aid-agreements': '🤝',
  'grants': '💰',
  'training': '📋',
  'maintenance': '🔧',
  'incidents': '🚒',
  'budget': '📊',
  'doc-vault': '📁',
  'sogs': '📖',
  'personnel-actions': '👤',
  'inspections': '🔍',
  'hazmat': '☣️',
  'meeting-minutes': '🗣️',
};

const MODULE_COLORS = {
  'aid-agreements': 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-900',
  'grants': 'bg-green-50 dark:bg-green-950/50 border-green-200 dark:border-green-900',
  'training': 'bg-purple-50 dark:bg-purple-950/50 border-purple-200 dark:border-purple-900',
  'maintenance': 'bg-orange-50 dark:bg-orange-950/50 border-orange-200 dark:border-orange-900',
  'incidents': 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900',
  'budget': 'bg-yellow-50 dark:bg-yellow-950/50 border-yellow-200 dark:border-yellow-900',
  'doc-vault': 'bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-700',
  'sogs': 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-900',
  'personnel-actions': 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-900',
  'inspections': 'bg-cyan-50 dark:bg-cyan-950/50 border-cyan-200 dark:border-cyan-900',
  'hazmat': 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900',
  'meeting-minutes': 'bg-pink-50 dark:bg-pink-950/50 border-pink-200 dark:border-pink-900',
};

const CONFIDENCE_COLORS = {
  high: 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900',
  medium: 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900',
  low: 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900',
};

function ConfBadge({ level }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${CONFIDENCE_COLORS[level] || CONFIDENCE_COLORS.low}`}>
      {level}
    </span>
  );
}

function ModuleOption({ module, confidence, onSelect }) {
  return (
    <button
      onClick={onSelect}
      className={`w-full p-4 rounded-xl border-2 transition-all text-left ${MODULE_COLORS[module]} hover:shadow-md`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1">
          <span className="text-2xl">{MODULE_ICONS[module] || '📦'}</span>
          <div>
            <p className="font-semibold text-gray-900 dark:text-gray-100 capitalize">{module.replace('-', ' ')}</p>
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">Select to file in this module</p>
          </div>
        </div>
        <ConfBadge level={confidence} />
      </div>
    </button>
  );
}

function RecentFilingRow({ filing }) {
  const moduleIcon = MODULE_ICONS[filing.module] || '📦';
  return (
    <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-700">
      <span className="text-xl">{moduleIcon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{filing.title || filing.filename}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {filing.module} · {new Date(filing.filed_at).toLocaleDateString()}
        </p>
      </div>
      <div className="text-right text-xs text-gray-500 dark:text-gray-400">{filing.size || '—'}</div>
    </div>
  );
}

export default function EmailIngest() {
  const [step, setStep] = useState('paste'); // paste | modules | filing | recent
  const [emailContent, setEmailContent] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailFrom, setEmailFrom] = useState('');
  const [classifications, setClassifications] = useState([]);
  const [selectedModule, setSelectedModule] = useState(null);
  const [recentFilings, setRecentFilings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expandedRecent, setExpandedRecent] = useState(true);
  const [copied, setCopied] = useState(false);

  // Fetch recent filings on mount
  useEffect(() => {
    loadRecentFilings();
  }, []);

  async function loadRecentFilings() {
    try {
      const data = await api.get('/api/email-ingest/recent?limit=5');
      setRecentFilings(data?.data || []);
    } catch (err) {
      console.error('Failed to load recent filings:', err);
    }
  }

  async function handleClassify() {
    if (!emailContent.trim()) {
      setError('Please paste email content first');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await api.post('/api/email-ingest/classify', {
        content: emailContent,
        subject: emailSubject || undefined,
        from: emailFrom || undefined,
      });
      setClassifications(result?.classifications || []);
      setStep('modules');
    } catch (err) {
      setError(err.message || 'Classification failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleFileDocument() {
    if (!selectedModule || !emailContent.trim()) {
      setError('Please select a module');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await api.post('/api/email-ingest/file', {
        module: selectedModule,
        content: emailContent,
        subject: emailSubject || undefined,
        from: emailFrom || undefined,
      });
      setSuccess(`Filed to ${selectedModule.replace('-', ' ')}`);
      setStep('success');
      // Reset form
      setTimeout(() => {
        setEmailContent('');
        setEmailSubject('');
        setEmailFrom('');
        setClassifications([]);
        setSelectedModule(null);
        setStep('paste');
        loadRecentFilings();
        setSuccess('');
      }, 2000);
    } catch (err) {
      setError(err.message || 'Filing failed');
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(emailContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Mail size={32} className="text-red-600 dark:text-red-400" />
          Email to Module
        </h1>
        <p className="text-gray-600 dark:text-gray-300 mt-1">Paste email content to automatically file it in the right module</p>
      </div>

      {/* Main grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: Paste area or modules */}
        <div className="lg:col-span-2">
          {step === 'paste' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">From (optional)</label>
                <input
                  type="email"
                  value={emailFrom}
                  onChange={(e) => setEmailFrom(e.target.value)}
                  placeholder="sender@example.com"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-600"
                />
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Subject (optional)</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Email subject line"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-600"
                />
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Email Content</label>
                  {emailContent && (
                    <button
                      onClick={copyToClipboard}
                      className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  )}
                </div>
                <textarea
                  value={emailContent}
                  onChange={(e) => setEmailContent(e.target.value)}
                  placeholder="Paste email body here..."
                  rows={12}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-600 resize-none"
                />
                <p className="text-xs text-gray-400 mt-2">
                  {emailContent.length} characters
                </p>
              </div>

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg flex items-start gap-2">
                  <AlertTriangle size={16} className="text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
                </div>
              )}

              <button
                onClick={handleClassify}
                disabled={loading || !emailContent.trim()}
                className="w-full bg-red-600 text-white font-semibold py-3 rounded-xl hover:bg-red-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 transition-colors flex items-center justify-center gap-2"
              >
                {loading && <Loader2 size={18} className="animate-spin" />}
                {loading ? 'Analyzing...' : 'Classify Email'}
              </button>
            </div>
          )}

          {step === 'modules' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Select Target Module</h2>
                <button
                  onClick={() => setStep('paste')}
                  className="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 font-medium"
                >
                  Edit Email
                </button>
              </div>

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg flex items-start gap-2">
                  <AlertTriangle size={16} className="text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
                </div>
              )}

              <div className="space-y-2">
                {classifications.map((cls, idx) => (
                  <ModuleOption
                    key={idx}
                    module={cls.module}
                    confidence={cls.confidence_level}
                    onSelect={() => {
                      setSelectedModule(cls.module);
                      setStep('filing');
                    }}
                  />
                ))}
              </div>

              {classifications.length === 0 && (
                <div className="p-4 bg-gray-50 dark:bg-gray-950 rounded-lg text-center text-sm text-gray-600 dark:text-gray-300">
                  No classifications available
                </div>
              )}
            </div>
          )}

          {step === 'filing' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Confirm Filing</h2>
                <button
                  onClick={() => setStep('modules')}
                  className="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 font-medium"
                >
                  Change Module
                </button>
              </div>

              <div className={`p-5 rounded-xl border-2 ${MODULE_COLORS[selectedModule]} bg-white dark:bg-gray-900`}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-3xl">{MODULE_ICONS[selectedModule] || '📦'}</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Filing to</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100 capitalize">{selectedModule.replace('-', ' ')}</p>
                  </div>
                </div>

                <div className="text-sm text-gray-600 dark:text-gray-300 space-y-2 bg-gray-50 dark:bg-gray-950 p-3 rounded-lg mb-4 max-h-32 overflow-y-auto">
                  {emailFrom && <p><span className="font-semibold">From:</span> {emailFrom}</p>}
                  {emailSubject && <p><span className="font-semibold">Subject:</span> {emailSubject}</p>}
                  <p><span className="font-semibold">Content:</span> {emailContent.slice(0, 150)}...</p>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg flex items-start gap-2">
                  <AlertTriangle size={16} className="text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setStep('modules')}
                  disabled={loading}
                  className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-semibold py-3 rounded-xl hover:bg-gray-300 disabled:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleFileDocument}
                  disabled={loading}
                  className="flex-1 bg-red-600 text-white font-semibold py-3 rounded-xl hover:bg-red-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 transition-colors flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 size={18} className="animate-spin" />}
                  {loading ? 'Filing...' : 'File Document'}
                </button>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="p-6 bg-emerald-50 dark:bg-emerald-950/50 border-2 border-emerald-200 dark:border-emerald-900 rounded-xl text-center">
              <CheckCircle2 size={32} className="text-emerald-600 dark:text-emerald-400 mx-auto mb-3" />
              <p className="text-lg font-semibold text-emerald-900 dark:text-emerald-200">{success}</p>
              <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">Document has been filed successfully</p>
            </div>
          )}
        </div>

        {/* Right: Recent filings */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 h-fit">
          <button
            onClick={() => setExpandedRecent(!expandedRecent)}
            aria-expanded={expandedRecent}
            className="w-full flex items-center justify-between mb-4 hover:bg-gray-50 dark:hover:bg-gray-800 px-2 py-1 rounded-lg transition-colors"
          >
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <FileText size={16} className="text-red-600 dark:text-red-400" />
              Recent Filings
            </h3>
            {expandedRecent ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {expandedRecent && (
            <div className="space-y-2">
              {recentFilings.length > 0 ? (
                recentFilings.map((filing, idx) => (
                  <RecentFilingRow key={idx} filing={filing} />
                ))
              ) : (
                <p className="text-sm text-gray-400 text-center py-4">No recent filings</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
