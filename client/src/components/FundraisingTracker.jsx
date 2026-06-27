import { useState, useEffect, useMemo } from 'react';
import {
  Plus, Edit2, Trash2, X, TrendingUp, BarChart3, DollarSign,
  Calendar, User, Heart, Target, Zap,
} from 'lucide-react';
import { api } from '../utils/api';
import LinkedMeetings from './LinkedMeetings';
import Attachments from './Attachments';

// ─── Constants ────────────────────────────────────────────────────────────────

const CAMPAIGN_TYPES = [
  'Fund Drive',
  'Benefit Event',
  'Online Campaign',
  'Grant',
  'Memorial Fund',
];

const CAMPAIGN_TYPE_COLORS = {
  'Fund Drive': { bg: 'bg-blue-100 dark:bg-blue-950/50', text: 'text-blue-700 dark:text-blue-300' },
  'Benefit Event': { bg: 'bg-green-100 dark:bg-green-950/50', text: 'text-green-700 dark:text-green-300' },
  'Online Campaign': { bg: 'bg-purple-100 dark:bg-purple-950/50', text: 'text-purple-700 dark:text-purple-300' },
  'Grant': { bg: 'bg-amber-100 dark:bg-amber-950/50', text: 'text-amber-700 dark:text-amber-300' },
  'Memorial Fund': { bg: 'bg-red-100 dark:bg-red-950/50', text: 'text-red-700 dark:text-red-300' },
};

const CAMPAIGN_STATUSES = ['Planning', 'Active', 'Completed', 'Cancelled'];
const CAMPAIGN_STATUS_COLORS = {
  Planning: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-300' },
  Active: { bg: 'bg-green-100 dark:bg-green-950/50', text: 'text-green-700 dark:text-green-300' },
  Completed: { bg: 'bg-blue-100 dark:bg-blue-950/50', text: 'text-blue-700 dark:text-blue-300' },
  Cancelled: { bg: 'bg-red-100 dark:bg-red-950/50', text: 'text-red-700 dark:text-red-300' },
};

const DONATION_METHODS = ['Check', 'Cash', 'Online', 'Credit Card', 'Wire Transfer'];
const DONATION_METHOD_COLORS = {
  Check: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-300' },
  Cash: { bg: 'bg-green-100 dark:bg-green-950/50', text: 'text-green-700 dark:text-green-300' },
  Online: { bg: 'bg-blue-100 dark:bg-blue-950/50', text: 'text-blue-700 dark:text-blue-300' },
  'Credit Card': { bg: 'bg-purple-100 dark:bg-purple-950/50', text: 'text-purple-700 dark:text-purple-300' },
  'Wire Transfer': { bg: 'bg-amber-100 dark:bg-amber-950/50', text: 'text-amber-700 dark:text-amber-300' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currency(n) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function CampaignTypeBadge({ type }) {
  const colors = CAMPAIGN_TYPE_COLORS[type] || CAMPAIGN_TYPE_COLORS['Fund Drive'];
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${colors.bg} ${colors.text}`}>
      {type}
    </span>
  );
}

function StatusBadge({ status }) {
  const colors = CAMPAIGN_STATUS_COLORS[status] || CAMPAIGN_STATUS_COLORS.Planning;
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${colors.bg} ${colors.text}`}>
      {status}
    </span>
  );
}

function DonationMethodBadge({ method }) {
  const colors = DONATION_METHOD_COLORS[method] || DONATION_METHOD_COLORS.Online;
  return (
    <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${colors.bg} ${colors.text}`}>
      {method}
    </span>
  );
}

// ─── Campaign Card ────────────────────────────────────────────────────────────

function CampaignCard({ campaign, onEdit, onDelete }) {
  const progress = campaign.goal ? Math.min(100, Math.round((campaign.raised / campaign.goal) * 100)) : 0;
  const remaining = Math.max(0, campaign.goal - campaign.raised);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100">{campaign.name}</h3>
            <CampaignTypeBadge type={campaign.type} />
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <button onClick={() => onEdit(campaign)}
              aria-label="Edit campaign"
              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded transition-colors">
              <Edit2 size={14} />
            </button>
            <button onClick={() => onDelete(campaign.id)}
              aria-label="Delete campaign"
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded transition-colors">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Progress</span>
            <span className="text-xs font-bold text-gray-900 dark:text-gray-100">{progress}%</span>
          </div>
          <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-1 text-xs text-gray-500 dark:text-gray-400">
            <span>{currency(campaign.raised)}</span>
            <span className={remaining > 0 ? 'text-gray-500 dark:text-gray-400' : 'text-green-600 dark:text-green-400'}>
              {remaining > 0 ? `${currency(remaining)} to go` : 'Goal reached!'}
            </span>
          </div>
        </div>

        {/* Meta */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-gray-400 mb-0.5">Goal</p>
            <p className="font-semibold text-gray-900 dark:text-gray-100">{currency(campaign.goal)}</p>
          </div>
          <div>
            <p className="text-gray-400 mb-0.5">Status</p>
            <StatusBadge status={campaign.status} />
          </div>
        </div>

        {/* Dates */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-2">
          {campaign.start_date && (
            <span className="flex items-center gap-1">
              <Calendar size={11} className="text-gray-400" />
              Started {fmtDate(campaign.start_date)}
            </span>
          )}
          {campaign.end_date && (
            <span className="flex items-center gap-1">
              <Calendar size={11} className="text-gray-400" />
              Ends {fmtDate(campaign.end_date)}
            </span>
          )}
        </div>

        {/* Linked Meetings */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-2 mt-2">
          <LinkedMeetings module="fundraising" recordId={campaign.id} recordLabel={campaign.name || 'Campaign'} />
          <Attachments module="fundraising" recordId={campaign.id} recordLabel={campaign.name || 'Campaign'} />
        </div>
      </div>
    </div>
  );
}

// ─── Campaign Form Modal ──────────────────────────────────────────────────────

function CampaignForm({ campaign, onSave, onCancel }) {
  const [name, setName] = useState(campaign?.name || '');
  const [type, setType] = useState(campaign?.type || 'Fund Drive');
  const [goal, setGoal] = useState(campaign?.goal || '');
  const [raised, setRaised] = useState(campaign?.raised || '0');
  const [status, setStatus] = useState(campaign?.status || 'Planning');
  const [startDate, setStartDate] = useState(campaign?.start_date || '');
  const [endDate, setEndDate] = useState(campaign?.end_date || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Campaign name is required');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const payload = {
        name: name.trim(),
        type,
        goal: parseFloat(goal) || 0,
        raised: parseFloat(raised) || 0,
        status,
        start_date: startDate || null,
        end_date: endDate || null,
      };

      if (campaign?.id) {
        await api.patch(`/api/fundraising/campaigns/${campaign.id}`, payload);
      } else {
        await api.post('/api/fundraising/campaigns', payload);
      }
      onSave();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {campaign ? 'Edit Campaign' : 'New Campaign'}
          </h2>
          <button onClick={onCancel} aria-label="Close form" className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Campaign Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Campaign Name"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
              placeholder="e.g., Summer Fund Drive"
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                aria-label="Campaign type"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                disabled={loading}
              >
                {CAMPAIGN_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                aria-label="Campaign status"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                disabled={loading}
              >
                {CAMPAIGN_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Goal ($)</label>
              <input
                type="number"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                aria-label="Goal in dollars"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                placeholder="0"
                step="100"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Already Raised ($)</label>
              <input
                type="number"
                value={raised}
                onChange={(e) => setRaised(e.target.value)}
                aria-label="Already raised in dollars"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                placeholder="0"
                step="100"
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                aria-label="Start Date"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                aria-label="End Date"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                disabled={loading}
              />
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-gray-100 dark:border-gray-700">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Donation Form Modal ──────────────────────────────────────────────────────

function DonationForm({ campaigns, donation, onSave, onCancel }) {
  const [donorName, setDonorName] = useState(donation?.donor_name || '');
  const [amount, setAmount] = useState(donation?.amount || '');
  const [method, setMethod] = useState(donation?.method || 'Online');
  const [campaignId, setCampaignId] = useState(donation?.campaign_id || '');
  const [date, setDate] = useState(donation?.donation_date || new Date().toISOString().slice(0, 10));
  const [receipt, setReceipt] = useState(donation?.receipt_sent || false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!donorName.trim() || !amount) {
      setError('Donor name and amount are required');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const payload = {
        donor_name: donorName.trim(),
        amount: parseFloat(amount) || 0,
        method,
        campaign_id: campaignId || null,
        donation_date: date,
        receipt_sent: receipt,
      };

      if (donation?.id) {
        await api.patch(`/api/fundraising/donations/${donation.id}`, payload);
      } else {
        await api.post('/api/fundraising/donations', payload);
      }
      onSave();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {donation ? 'Edit Donation' : 'Log Donation'}
          </h2>
          <button onClick={onCancel} aria-label="Close form" className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Donor Name *</label>
              <input
                type="text"
                value={donorName}
                onChange={(e) => setDonorName(e.target.value)}
                aria-label="Donor Name"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                placeholder="John Doe"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount ($) *</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-label="Donation amount in dollars"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                placeholder="0"
                step="0.01"
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Method</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                aria-label="Donation method"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                disabled={loading}
              >
                {DONATION_METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Campaign</label>
              <select
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                aria-label="Campaign"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                disabled={loading}
              >
                <option value="">General</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Donation date"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
                disabled={loading}
              />
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2 p-2 border border-gray-300 dark:border-gray-700 rounded-lg w-full cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <input
                  type="checkbox"
                  checked={receipt}
                  onChange={(e) => setReceipt(e.target.checked)}
                  className="rounded"
                  disabled={loading}
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Receipt sent</span>
              </label>
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-gray-100 dark:border-gray-700">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FundraisingTracker() {
  const [campaigns, setCampaigns] = useState([]);
  const [donations, setDonations] = useState([]);
  const [activeTab, setActiveTab] = useState('campaigns');
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterCampaignId, setFilterCampaignId] = useState('');

  // Fetch data on mount
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const [campaignsData, donationsData] = await Promise.all([
          api.get('/api/fundraising/campaigns'),
          api.get('/api/fundraising/donations'),
        ]);
        setCampaigns(campaignsData || []);
        setDonations(donationsData || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleCreateCampaign = () => {
    setEditTarget(null);
    setShowForm(true);
  };

  const handleEditCampaign = (campaign) => {
    setEditTarget(campaign);
    setShowForm(true);
  };

  const handleDeleteCampaign = async (id) => {
    if (!window.confirm('Delete this campaign?')) return;
    try {
      await api.delete(`/api/fundraising/campaigns/${id}`);
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateDonation = () => {
    setEditTarget(null);
    setShowForm(true);
  };

  const handleEditDonation = (donation) => {
    setEditTarget(donation);
    setShowForm(true);
  };

  const handleDeleteDonation = async (id) => {
    if (!window.confirm('Delete this donation?')) return;
    try {
      await api.delete(`/api/fundraising/donations/${id}`);
      setDonations((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSave = async () => {
    setShowForm(false);
    setEditTarget(null);
    // Refetch data
    try {
      const [campaignsData, donationsData] = await Promise.all([
        api.get('/api/fundraising/campaigns'),
        api.get('/api/fundraising/donations'),
      ]);
      setCampaigns(campaignsData || []);
      setDonations(donationsData || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditTarget(null);
  };

  // Compute stats
  const totalRaised = useMemo(() => {
    return donations.reduce((sum, d) => sum + (d.amount || 0), 0);
  }, [donations]);

  const avgDonation = useMemo(() => {
    return donations.length > 0 ? totalRaised / donations.length : 0;
  }, [donations, totalRaised]);

  const filteredDonations = useMemo(() => {
    if (!filterCampaignId) return donations;
    return donations.filter((d) => d.campaign_id === parseInt(filterCampaignId));
  }, [donations, filterCampaignId]);

  if (loading) {
    return (
      <div className="w-full p-6 bg-gray-50 dark:bg-gray-950 rounded-lg">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-900 h-40 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={24} className="text-gray-700 dark:text-gray-300" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Fundraising Tracker</h1>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('campaigns')}
          className={`px-4 py-3 font-medium transition-colors border-b-2 ${
            activeTab === 'campaigns'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Campaigns
        </button>
        <button
          onClick={() => setActiveTab('donations')}
          className={`px-4 py-3 font-medium transition-colors border-b-2 ${
            activeTab === 'donations'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Donations
        </button>
      </div>

      {/* Campaigns Tab */}
      {activeTab === 'campaigns' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={handleCreateCampaign}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={18} />
              New Campaign
            </button>
          </div>

          {campaigns.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
              <Target size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-gray-500 dark:text-gray-400">No campaigns yet</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
              {campaigns.map((campaign) => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  onEdit={handleEditCampaign}
                  onDelete={handleDeleteCampaign}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Donations Tab */}
      {activeTab === 'donations' && (
        <div className="space-y-4">
          {/* Stats bar */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-0.5">Total Raised</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{currency(totalRaised)}</p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-0.5">Donation Count</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{donations.length}</p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-0.5">Average Donation</p>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{currency(avgDonation)}</p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-4">
            <div className="flex-1 max-w-sm">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Filter by Campaign</label>
              <select
                value={filterCampaignId}
                onChange={(e) => setFilterCampaignId(e.target.value)}
                aria-label="Filter by Campaign"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none dark:bg-gray-900 dark:text-gray-100"
              >
                <option value="">All Donations</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="flex justify-end pt-7">
              <button
                onClick={handleCreateDonation}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus size={18} />
                Log Donation
              </button>
            </div>
          </div>

          {/* Donations list */}
          {filteredDonations.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
              <Heart size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-gray-500 dark:text-gray-400">No donations yet</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Donor</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">Amount</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Method</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Date</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-gray-300">Receipt</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {filteredDonations.map((donation) => (
                      <tr key={donation.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="px-4 py-3 text-gray-900 dark:text-gray-100 font-medium">{donation.donor_name}</td>
                        <td className="px-4 py-3 text-right font-bold text-green-600 dark:text-green-400">{currency(donation.amount)}</td>
                        <td className="px-4 py-3">
                          <DonationMethodBadge method={donation.method} />
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{fmtDate(donation.donation_date)}</td>
                        <td className="px-4 py-3 text-center">
                          {donation.receipt_sent ? (
                            <span className="inline-block px-2 py-1 bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300 text-xs font-semibold rounded">
                              Sent
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => handleEditDonation(donation)}
                              aria-label="Edit donation"
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded transition-colors">
                              <Edit2 size={14} />
                            </button>
                            <button onClick={() => handleDeleteDonation(donation.id)}
                              aria-label="Delete donation"
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Form modal */}
      {showForm && activeTab === 'campaigns' && (
        <CampaignForm
          campaign={editTarget}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}

      {showForm && activeTab === 'donations' && (
        <DonationForm
          campaigns={campaigns}
          donation={editTarget}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
