import { useState, useMemo, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Flame, Truck, Users, AlertTriangle, Shield, Activity, Clock } from 'lucide-react';
import { api } from '../utils/api';
import { loadSettings } from '../data/stationSettings';

// ─── Colour palette for incident types ───────────────────────────────────────
const TYPE_COLORS = {
  'Structure Fire':       '#dc2626',
  'Vehicle Fire':         '#ea580c',
  'Brush / Wildland Fire':'#d97706',
  'Dumpster / Rubbish Fire': '#ca8a04',
  'Vehicle Accident':     '#2563eb',
  'Technical Rescue':     '#7c3aed',
  'Water Rescue':         '#0891b2',
  'Medical / EMS':        '#059669',
  'Hazmat':               '#9333ea',
  'Gas Leak':             '#f59e0b',
  'Public Assist':        '#64748b',
  'False Alarm':          '#94a3b8',
  'Mutual Aid':           '#0ea5e9',
  'Other':                '#a1a1aa',
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const UNIT_STATUS_COLORS = {
  'In Service':    { dot: 'bg-green-500', text: 'text-green-700 dark:text-green-300', bg: 'bg-green-50 dark:bg-green-950/50 border-green-200 dark:border-green-900' },
  'Out of Service':{ dot: 'bg-red-500',   text: 'text-red-700 dark:text-red-300',   bg: 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900'     },
  'Reserve':       { dot: 'bg-blue-400',  text: 'text-blue-700 dark:text-blue-300',  bg: 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-900'   },
  'Maintenance':   { dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-900' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${m}/${d}/${y}`;
}

// Redact address to block/area level for public display
function publicAddress(address) {
  if (!address) return 'Maplewood Area';
  // Just show the street name portion, strip house number
  const parts = address.split(',');
  const street = parts[0].replace(/^\d+\s+/, '').trim();
  const area   = parts.slice(1).join(',').trim();
  return area ? `${street} area, ${area}` : `${street} area`;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color = 'text-red-700 dark:text-red-300', bg = 'bg-red-50 dark:bg-red-950/50' }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 flex items-start gap-4">
      <div className={`p-3 rounded-xl ${bg} flex-shrink-0`}>
        <Icon size={20} className={color} />
      </div>
      <div>
        <p className={`text-3xl font-black ${color}`}>{value}</p>
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 leading-tight">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PublicDashboard() {
  const [incidents, setIncidents] = useState([]);
  const [apparatus, setApparatus] = useState([]);
  const [loading, setLoading] = useState(true);

  const settings = loadSettings();
  const stationName    = settings?.stationName    || 'Station 14';
  const departmentName = settings?.departmentName || 'Maplewood VFD';

  const now       = new Date();
  const thisYear  = now.getFullYear();
  const lastUpdated = now.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });

  // Fetch data on mount
  useEffect(() => {
    async function fetch() {
      try {
        const [incRes, appRes] = await Promise.all([
          api.get('/api/incidents'),
          api.get('/api/apparatus'),
        ]);
        const incidents = Array.isArray(incRes?.data) ? incRes.data : Array.isArray(incRes) ? incRes : [];
        const apparatus = Array.isArray(appRes?.data) ? appRes.data : Array.isArray(appRes) ? appRes : [];
        setIncidents(incidents);
        setApparatus(apparatus);
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, []);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const ytd = incidents.filter((i) => i.date?.startsWith(String(thisYear)));

    const fires        = ytd.filter((i) => i.type.includes('Fire')).length;
    const ems          = ytd.filter((i) => i.type === 'Medical / EMS').length;
    const rescues      = ytd.filter((i) =>
      ['Vehicle Accident','Technical Rescue','Water Rescue'].includes(i.type)).length;
    const totalInjuries = ytd.reduce((sum, i) => sum + (i.injuries || 0), 0);

    // Unique personnel across all YTD incidents
    const allPersonnel = new Set(ytd.flatMap((i) => i.personnel || []));

    // Mutual aid given
    const mutualAidGiven = ytd.filter((i) =>
      i.disposition === 'Mutual Aid Given' || i.type === 'Mutual Aid').length;

    return {
      total: ytd.length,
      fires,
      ems,
      rescues,
      totalInjuries,
      uniquePersonnel: allPersonnel.size,
      mutualAidGiven,
    };
  }, [thisYear, incidents]);

  // ── Calls by month ─────────────────────────────────────────────────────────
  const monthlyData = useMemo(() => {
    const counts = Array(12).fill(0);
    incidents
      .filter((i) => i.date?.startsWith(String(thisYear)))
      .forEach((i) => {
        const month = parseInt(i.date.split('-')[1], 10) - 1;
        counts[month]++;
      });
    return MONTHS.map((m, idx) => ({ month: m, calls: counts[idx] }))
      .filter((_, idx) => idx <= now.getMonth()); // only show elapsed months
  }, [thisYear, incidents]);

  // ── Calls by type ──────────────────────────────────────────────────────────
  const typeData = useMemo(() => {
    const map = {};
    incidents
      .filter((i) => i.date?.startsWith(String(thisYear)))
      .forEach((i) => { map[i.type] = (map[i.type] || 0) + 1; });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count, fill: TYPE_COLORS[type] || '#94a3b8' }));
  }, [thisYear, incidents]);

  // ── Recent incidents (public-safe) ─────────────────────────────────────────
  const recentIncidents = useMemo(() =>
    [...incidents]
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
      .slice(0, 8)
  , [incidents]);

  // ── Unit status ────────────────────────────────────────────────────────────
  const frontlineUnits = apparatus.filter((a) => a.status !== 'Reserve');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border border-gray-300 dark:border-gray-700 border-t-red-700 mx-auto mb-3"></div>
          <p className="text-sm text-gray-400">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Station header ──────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-red-700 to-red-900 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Shield size={28} className="text-white" />
            </div>
            <div>
              <p className="text-red-200 text-sm font-medium">{departmentName}</p>
              <h1 className="text-2xl font-black text-white leading-tight">{stationName}</h1>
              <p className="text-red-200 text-sm mt-0.5">Public Activity Dashboard · {thisYear}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-red-300 uppercase tracking-wider font-semibold">Last Updated</p>
            <p className="text-sm font-bold text-white">{lastUpdated}</p>
            <div className="flex items-center gap-1.5 justify-end mt-1">
              <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs text-red-200">Live Data</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── YTD Stats ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          icon={Activity}
          label="Total Responses"
          value={stats.total}
          sub={`YTD ${thisYear}`}
          color="text-red-700 dark:text-red-300"
          bg="bg-red-50 dark:bg-red-950/50"
        />
        <StatCard
          icon={Flame}
          label="Fire Incidents"
          value={stats.fires}
          sub="All fire types"
          color="text-orange-600 dark:text-orange-400"
          bg="bg-orange-50 dark:bg-orange-950/50"
        />
        <StatCard
          icon={Shield}
          label="EMS Responses"
          value={stats.ems}
          sub="Medical calls"
          color="text-emerald-700 dark:text-emerald-300"
          bg="bg-emerald-50 dark:bg-emerald-950/50"
        />
        <StatCard
          icon={Truck}
          label="Rescues"
          value={stats.rescues}
          sub="MVA & technical"
          color="text-blue-700 dark:text-blue-300"
          bg="bg-blue-50 dark:bg-blue-950/50"
        />
        <StatCard
          icon={Users}
          label="Members Deployed"
          value={stats.uniquePersonnel}
          sub="Unique YTD"
          color="text-purple-700 dark:text-purple-300"
          bg="bg-purple-50 dark:bg-purple-950/50"
        />
        <StatCard
          icon={AlertTriangle}
          label="Injuries"
          value={stats.totalInjuries}
          sub="Line-of-duty"
          color="text-amber-700 dark:text-amber-300"
          bg="bg-amber-50 dark:bg-amber-950/50"
        />
      </div>

      {/* ── Charts row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Monthly calls bar chart */}
        <div className="lg:col-span-3 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Activity size={15} className="text-red-600 dark:text-red-400" />
            Calls by Month — {thisYear}
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyData} barSize={28} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                formatter={(v) => [`${v} calls`, 'Responses']}
              />
              <Bar dataKey="calls" fill="#dc2626" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Calls by type donut */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Flame size={15} className="text-red-600 dark:text-red-400" />
            Calls by Type — {thisYear}
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={typeData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="count"
              >
                {typeData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                formatter={(v, _, p) => [`${v} call${v !== 1 ? 's' : ''}`, p.payload.type]}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div className="mt-2 space-y-1 max-h-28 overflow-y-auto">
            {typeData.map((d) => (
              <div key={d.type} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: d.fill }} />
                <span className="flex-1 truncate">{d.type}</span>
                <span className="font-bold text-gray-800 dark:text-gray-100">{d.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Unit status board ────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
        <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Truck size={15} className="text-red-600 dark:text-red-400" />
          Unit Status Board
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {frontlineUnits.map((unit) => {
            const sc = UNIT_STATUS_COLORS[unit.status] ?? UNIT_STATUS_COLORS['In Service'];
            return (
              <div
                key={unit.id}
                className={`rounded-xl border px-3 py-3 ${sc.bg}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`h-2 w-2 rounded-full flex-shrink-0 ${sc.dot}`} />
                  <p className="text-xs font-bold text-gray-800 dark:text-gray-100 truncate">{unit.designation}</p>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{unit.type}</p>
                <p className={`text-xs font-semibold mt-1 ${sc.text}`}>{unit.status}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Recent activity ──────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
          <Clock size={15} className="text-red-600 dark:text-red-400" />
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">Recent Incidents</h2>
          <span className="text-xs text-gray-400 ml-1">Public summary · addresses generalized for privacy</span>
        </div>
        <div className="divide-y divide-gray-50">
          {recentIncidents.map((inc) => {
            const dotColor = TYPE_COLORS[inc.type] || '#94a3b8';
            return (
              <div key={inc.id} className="px-5 py-3 flex items-start gap-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                {/* Date/time */}
                <div className="text-right flex-shrink-0 w-20">
                  <p className="text-xs font-bold text-gray-700 dark:text-gray-300">{fmtDate(inc.date)}</p>
                  <p className="text-xs text-gray-400">{inc.time}</p>
                </div>

                {/* Type dot + details */}
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span
                    className="h-3 w-3 rounded-full flex-shrink-0 mt-0.5"
                    style={{ background: dotColor }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-800 dark:text-gray-100">{inc.type}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{publicAddress(inc.address)}</p>
                  </div>
                </div>

                {/* Units */}
                <div className="hidden sm:flex flex-wrap gap-1 flex-shrink-0 max-w-[200px] justify-end">
                  {inc.units?.map((u) => (
                    <span key={u}
                      className="text-[10px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded-md">
                      {u}
                    </span>
                  ))}
                </div>

                {/* Disposition */}
                <div className="hidden md:block flex-shrink-0 text-right w-36">
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug">{inc.disposition}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 bg-gray-50 dark:bg-gray-950 border-t border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-400 text-center">
            For emergencies, call 911 · Non-emergency: contact {departmentName} · Data refreshed with each session
          </p>
        </div>
      </div>
    </div>
  );
}
