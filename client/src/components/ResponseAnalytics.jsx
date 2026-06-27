import { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, AlertCircle, BarChart3, Clock, CheckCircle2,
  Activity, Flame,
} from 'lucide-react';
import { api } from '../utils/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(minutes) {
  if (!minutes) return '—';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hrs}h ${mins}m`;
}

function getTrendColor(trend) {
  if (trend === 'improving') return 'text-green-600 dark:text-green-400';
  if (trend === 'worsening') return 'text-red-600 dark:text-red-400';
  return 'text-gray-400';
}

function getTrendIcon(trend) {
  if (trend === 'improving') return TrendingDown;
  if (trend === 'worsening') return TrendingUp;
  return Activity;
}

function getTimeColor(minutes) {
  if (!minutes) return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700';
  if (minutes < 5) return 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300 border-green-200 dark:border-green-900';
  if (minutes < 8) return 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900';
  return 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900';
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ─── Monthly Trend Bar Chart ──────────────────────────────────────────────────

function MonthlyTrendChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Monthly Trend</h2>
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          No data available
        </div>
      </div>
    );
  }

  const maxTime = Math.max(...data.map((d) => d.avg_turnout_time || 0), 1);
  const scale = 100 / maxTime;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-6">Monthly Average Turnout Time</h2>

      <div className="space-y-3">
        {data.map((month, idx) => {
          const time = month.avg_turnout_time || 0;
          const width = Math.max(5, time * scale);
          const barColor = getTimeColor(time).split(' ')[0];
          const textColor = getTimeColor(time).split(' ')[1];

          return (
            <div key={idx}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{month.month}</span>
                <span className={`text-sm font-bold ${textColor}`}>
                  {formatTime(time)}
                </span>
              </div>
              <div className="w-full h-6 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
                <div
                  className={`h-full ${barColor} border-l ${getTimeColor(time).split(' ')[2]} transition-all`}
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, subtext, color = 'text-gray-700 dark:text-gray-300' }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-gray-50 dark:bg-gray-950 rounded-lg">
          <Icon size={18} className={color} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-0.5">{label}</p>
          <p className={`text-2xl font-bold ${color} leading-none`}>{value}</p>
          {subtext && (
            <p className="text-xs text-gray-400 mt-1">{subtext}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ResponseAnalytics() {
  const [data, setData] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortField, setSortField] = useState('turnout_time');
  const [sortAsc, setSortAsc] = useState(true);

  // Fetch analytics data on mount
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const result = await api.get('/api/response-analytics');
        setData(result);
        if (result.incidents && result.incidents.length > 0) {
          setIncidents(result.incidents);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Sort incidents
  const sortedIncidents = useMemo(() => {
    if (!incidents || incidents.length === 0) return [];

    const sorted = [...incidents].sort((a, b) => {
      let aVal, bVal;

      if (sortField === 'turnout_time') {
        aVal = a.turnout_time || 0;
        bVal = b.turnout_time || 0;
      } else if (sortField === 'date') {
        aVal = new Date(a.dispatch_date || 0);
        bVal = new Date(b.dispatch_date || 0);
      } else if (sortField === 'address') {
        aVal = (a.address || '').toLowerCase();
        bVal = (b.address || '').toLowerCase();
      } else {
        aVal = a[sortField] || 0;
        bVal = b[sortField] || 0;
      }

      if (aVal < bVal) return sortAsc ? -1 : 1;
      if (aVal > bVal) return sortAsc ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [incidents, sortField, sortAsc]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  if (loading) {
    return (
      <div className="w-full p-6 bg-gray-50 dark:bg-gray-950 rounded-lg">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-900 h-24 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // Check if we have timing data
  const hasTimingData = data && data.avg_turnout_time !== null && data.avg_turnout_time !== undefined;
  const TrendIcon = getTrendIcon(data?.trend);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BarChart3 size={24} className="text-gray-700 dark:text-gray-300" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">AI Response Analytics</h1>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* No data message */}
      {!hasTimingData && (
        <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-lg px-4 py-3 flex items-start gap-3">
          <AlertCircle size={18} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">Response time tracking requires arrival timestamps on incidents.</p>
            <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">Make sure to record arrival times when creating incident reports.</p>
          </div>
        </div>
      )}

      {/* Stats bar */}
      {hasTimingData && (
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard
            icon={Clock}
            label="Avg Turnout Time"
            value={formatTime(data.avg_turnout_time)}
            subtext="minutes"
            color={
              data.avg_turnout_time < 5 ? 'text-green-600 dark:text-green-400'
              : data.avg_turnout_time < 8 ? 'text-amber-600 dark:text-amber-400'
              : 'text-red-600 dark:text-red-400'
            }
          />

          <StatCard
            icon={Flame}
            label="Total Incidents"
            value={data.total_incidents || 0}
            color="text-orange-600 dark:text-orange-400"
          />

          <StatCard
            icon={CheckCircle2}
            label="With Timing Data"
            value={data.incidents_with_timing || 0}
            subtext={`${data.total_incidents ? Math.round((data.incidents_with_timing / data.total_incidents) * 100) : 0}%`}
            color="text-blue-600 dark:text-blue-400"
          />

          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-gray-50 dark:bg-gray-950 rounded-lg">
                <TrendIcon size={18} className={getTrendColor(data.trend)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-0.5">Trend</p>
                <p className={`text-sm font-bold capitalize ${getTrendColor(data.trend)}`}>
                  {data.trend || 'stable'}
                </p>
                <p className="text-xs text-gray-400 mt-1">vs. last month</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Monthly trend chart */}
      {hasTimingData && data.monthly_data && (
        <MonthlyTrendChart data={data.monthly_data} />
      )}

      {/* Incidents table */}
      {hasTimingData && incidents.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Recent Incidents</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <button
                      onClick={() => handleSort('date')}
                      className="font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 flex items-center gap-1"
                    >
                      Date
                      {sortField === 'date' && (
                        <span className="text-xs">{sortAsc ? '↑' : '↓'}</span>
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button
                      onClick={() => handleSort('address')}
                      className="font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 flex items-center gap-1"
                    >
                      Address
                      {sortField === 'address' && (
                        <span className="text-xs">{sortAsc ? '↑' : '↓'}</span>
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button
                      onClick={() => handleSort('turnout_time')}
                      className="font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 flex items-center gap-1"
                    >
                      Turnout Time
                      {sortField === 'turnout_time' && (
                        <span className="text-xs">{sortAsc ? '↑' : '↓'}</span>
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {sortedIncidents.map((incident) => (
                  <tr key={incident.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      {formatDate(incident.dispatch_date)}
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-gray-100 font-medium max-w-xs truncate">
                      {incident.address || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-3 py-1 rounded border ${getTimeColor(incident.turnout_time)}`}>
                        {formatTime(incident.turnout_time)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-xs">
                      {incident.incident_type || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasTimingData && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
          <BarChart3 size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">No timing data yet</p>
          <p className="text-gray-500 dark:text-gray-400">Start recording arrival times on incidents to see analytics</p>
        </div>
      )}
    </div>
  );
}
