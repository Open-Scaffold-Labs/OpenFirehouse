// TVDisplay.jsx — "Today" Wall Display for Apple TV / Large Screen
// ──────────────────────────────────────────────────────────────────
// Accessed via /tv?pin=XXXX-XXXX — no login required.
// Auto-switches between STANDBY and INCIDENT modes.
// Designed for 10-foot viewing distance on a 55-65" screen.
//
// This IS the user interface. Firefighters walk in, glance at the TV,
// and know everything about their day. Zero interaction required.
// Auto-refreshes all data. Optimized for glanceability.

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, unitStatusTopic } from '../utils/supabase';
import { reportChannelStatus, reportMessageReceived, forgetChannel } from '../utils/realtimeHealth';
// TODO FeedStatus on the TV surface. It reports its health above, but the
// indicator is not rendered here yet: a 24/7 wall display needs a deliberate
// placement decision (glanceable from across a bay, and it must not push the
// unit strip around), not a guess. Tracked as a follow-up.
import { tonePar } from '../utils/alertTones';
import { reconnectDelay } from '../utils/backoff';
import ScreenErrorBoundary from './ScreenErrorBoundary';

const API_BASE = import.meta.env.VITE_API_URL || '';

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function useElapsed(startIso) {
  const now = useNow();
  if (!startIso) return null;
  const secs = Math.floor((now - new Date(startIso)) / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0
    ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function useAutoRefresh(fetcher, intervalMs, dep) {
  const [data, setData] = useState(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const result = await fetcherRef.current();
        if (mounted) setData(result);
      } catch (e) { /* silent */ }
    };
    run();
    const id = setInterval(run, intervalMs);
    return () => { mounted = false; clearInterval(id); };
    // `dep` (optional) lets a caller force an immediate refetch (e.g. on a
    // realtime event). Existing callers pass nothing → stable → unchanged.
  }, [intervalMs, dep]);
  return data;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function getInitials(name = '') {
  return name.split(' ').map(n => n[0] || '').slice(0, 2).join('').toUpperCase();
}

const APPARATUS_STATUS = {
  'In Service':    { color: '#22c55e', label: 'IN SERVICE' },
  'En Route':      { color: '#f59e0b', label: 'EN ROUTE' },
  'Responding':    { color: '#f59e0b', label: 'RESPONDING' },
  'On Scene':      { color: '#f97316', label: 'ON SCENE' },
  'Maintenance':   { color: '#f59e0b', label: 'MAINTENANCE' },
  'Out of Service':{ color: '#ef4444', label: 'OUT OF SERVICE' },
};

const APPARATUS_TYPE_ICONS = {
  'Engine': '🚒', 'Ladder / Aerial': '🪜', 'Tanker': '🚛', 'Rescue': '🔧',
  'Brush': '🌲', 'Command': '🚗', 'Utility': '🔩', 'Ambulance / EMS': '🚑',
  'Hazmat': '☣️', 'Foam Unit': '💧',
};

// ─── TV Header: Clock + Station Name ──────────────────────────────────────────

function TVHeader({ now, station }) {
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  const secs = String(now.getSeconds()).padStart(2, '0');
  const dateStr = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '20px 40px', borderBottom: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div>
        <p style={{ fontSize: 22, fontWeight: 900, letterSpacing: 3, textTransform: 'uppercase', color: '#9ca3af' }}>
          {station?.departmentName || station?.name || 'Open Firehouse'}
        </p>
        <p style={{ fontSize: 16, color: '#6b7280', marginTop: 2 }}>{dateStr}</p>
      </div>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 80, fontWeight: 900, color: '#f9fafb', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          {time}
        </span>
        <span style={{ fontSize: 28, color: '#4b5563', fontWeight: 700, fontVariantNumeric: 'tabular-nums', marginLeft: 4 }}>
          :{secs}
        </span>
      </div>
    </div>
  );
}

// ─── AI Briefing Strip ────────────────────────────────────────────────────────

function TVBriefingStrip({ briefing }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!briefing?.insights || briefing.insights.length <= 1) return;
    const iv = setInterval(() => setIdx(i => (i + 1) % briefing.insights.length), 8000);
    return () => clearInterval(iv);
  }, [briefing]);

  if (!briefing?.insights?.length) return null;

  const insight = briefing.insights[idx];
  const total = briefing.insights.length;

  const priorityBg = {
    1: 'rgba(185,28,28,0.6)',
    2: 'rgba(180,83,9,0.5)',
    3: 'rgba(55,65,81,0.6)',
    5: 'rgba(6,95,70,0.5)',
  };

  return (
    <div style={{
      background: priorityBg[insight.priority] || priorityBg[3],
      padding: '18px 40px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      display: 'flex', alignItems: 'center', gap: 20,
    }}>
      <span style={{ fontSize: 36, flexShrink: 0 }}>{insight.icon || '🔔'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
            AI BRIEFING
          </span>
          {total > 1 && (
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
              {idx + 1} of {total}
            </span>
          )}
        </div>
        <p style={{ fontSize: 26, fontWeight: 800, color: '#fff', lineHeight: 1.2, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {insight.headline}
        </p>
        {insight.detail && (
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {insight.detail}
          </p>
        )}
      </div>
      {total > 1 && (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {briefing.insights.map((_, i) => (
            <div key={i} style={{
              width: i === idx ? 20 : 6, height: 6, borderRadius: 3,
              background: i === idx ? '#fff' : 'rgba(255,255,255,0.2)',
              transition: 'all 0.3s ease',
            }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Readiness Bar (horizontal) ───────────────────────────────────────────────

function TVReadinessBar({ summary }) {
  if (!summary?.scorecard) return null;
  const sc = summary.scorecard;

  const statusColor = (s) =>
    s === 'green' ? '#22c55e' : s === 'red' ? '#ef4444' : '#f59e0b';

  const cards = [
    { label: 'STAFFING', value: `${sc.staffing?.active ?? '—'}`, status: sc.staffing?.status },
    { label: 'APPARATUS', value: `${sc.apparatus?.inService ?? '—'}/${sc.apparatus?.total ?? '?'}`, status: sc.apparatus?.status },
    { label: 'TRAINING', value: `${sc.training?.compliance ?? '—'}%`, status: sc.training?.status },
    { label: 'BUDGET', value: `${sc.budget?.remaining ?? '—'}%`, status: sc.budget?.status },
  ];

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0,
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      {cards.map(({ label, value, status }) => (
        <div key={label} style={{
          padding: '16px 30px',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 14, height: 14, borderRadius: '50%',
            background: statusColor(status || 'green'),
            flexShrink: 0,
            boxShadow: `0 0 8px ${statusColor(status || 'green')}66`,
          }} />
          <div>
            <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: 2, color: '#6b7280', textTransform: 'uppercase' }}>
              {label}
            </p>
            <p style={{ fontSize: 36, fontWeight: 900, color: '#f9fafb', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Today's Timeline (TV optimized) ──────────────────────────────────────────

function TVTimeline({ timeline }) {
  if (!timeline?.items) return null;

  const TYPE_ICONS = {
    event: '📅', shift: '👥', training: '📋', maintenance: '🔧', meeting: '🗣️',
  };
  const TYPE_COLORS = {
    event: '#3b82f6', shift: '#6366f1', training: '#f97316',
    maintenance: '#eab308', meeting: '#64748b',
  };

  const items = timeline.items.slice(0, 7); // max 7 items for TV

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <p style={{
        fontSize: 14, fontWeight: 900, letterSpacing: 3, textTransform: 'uppercase',
        color: '#6b7280', padding: '16px 24px 8px',
      }}>
        TODAY'S SCHEDULE
      </p>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {items.length === 0 && (
          <p style={{ fontSize: 22, color: '#4b5563', padding: '20px 24px' }}>
            No scheduled activities today
          </p>
        )}
        {items.map((item) => {
          const isCurrent = item.status_time === 'current';
          const isPast = item.status_time === 'past';
          return (
            <div
              key={item.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '12px 24px',
                opacity: isPast ? 0.4 : 1,
                borderLeft: isCurrent ? '4px solid #ef4444' : '4px solid transparent',
                background: isCurrent ? 'rgba(239,68,68,0.08)' : 'transparent',
                transition: 'all 0.3s ease',
              }}
            >
              {/* Time column */}
              <div style={{ width: 80, flexShrink: 0, textAlign: 'right' }}>
                {item.time ? (
                  <span style={{
                    fontSize: 18, fontWeight: 800, color: isCurrent ? '#ef4444' : '#9ca3af',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {fmt12(item.time)}
                  </span>
                ) : (
                  <span style={{ fontSize: 14, color: '#4b5563' }}>—</span>
                )}
              </div>

              {/* Type dot */}
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: TYPE_COLORS[item.type] || '#6b7280',
                flexShrink: 0,
              }} />

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontSize: 22, fontWeight: 700, color: '#f3f4f6',
                  lineHeight: 1.2,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {item.title}
                </p>
                {item.subtitle && (
                  <p style={{ fontSize: 14, color: '#6b7280', marginTop: 2 }}>
                    {item.subtitle}
                    {item.location ? ` · ${item.location}` : ''}
                  </p>
                )}
              </div>

              {/* NOW badge */}
              {isCurrent && (
                <span style={{
                  fontSize: 12, fontWeight: 900, letterSpacing: 2,
                  background: '#ef4444', color: '#fff',
                  padding: '4px 12px', borderRadius: 6,
                  flexShrink: 0, animation: 'pulse-glow 2s infinite',
                }}>
                  NOW
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* On Leave */}
      {timeline.on_leave?.length > 0 && (
        <div style={{
          padding: '12px 24px', borderTop: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(245,158,11,0.06)',
        }}>
          <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: 2, color: '#d97706', textTransform: 'uppercase' }}>
            ON LEAVE: {' '}
          </span>
          <span style={{ fontSize: 16, color: '#d97706' }}>
            {timeline.on_leave.map(m => m.name).join(', ')}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Weather Panel (TV size) ──────────────────────────────────────────────────

function TVWeather({ weather }) {
  if (!weather) return null;

  const c = weather.current;
  const t = weather.today;

  const condEmoji = (cond) => {
    const lower = (cond || '').toLowerCase();
    if (lower.includes('snow')) return '❄️';
    if (lower.includes('rain') || lower.includes('drizzle')) return '🌧️';
    if (lower.includes('thunder')) return '⛈️';
    if (lower.includes('cloud') || lower.includes('overcast')) return '☁️';
    if (lower.includes('fog')) return '🌫️';
    return '☀️';
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 0,
      borderLeft: '1px solid rgba(255,255,255,0.06)',
      width: 320, flexShrink: 0,
    }}>
      {/* Current */}
      <div style={{ padding: '20px 24px', textAlign: 'center' }}>
        <span style={{ fontSize: 48 }}>{condEmoji(c.conditions)}</span>
        <p style={{ fontSize: 64, fontWeight: 900, color: '#f9fafb', lineHeight: 1, marginTop: 8 }}>
          {c.temp}°
        </p>
        <p style={{ fontSize: 16, color: '#9ca3af', textTransform: 'capitalize', marginTop: 4 }}>
          {c.conditions}
        </p>
        {t && (
          <p style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>
            H {t.high}° · L {t.low}°
          </p>
        )}
      </div>

      {/* Wind */}
      <div style={{
        padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
      }}>
        <span style={{ fontSize: 28 }}>💨</span>
        <div>
          <p style={{
            fontSize: 28, fontWeight: 900, lineHeight: 1,
            color: c.wind_speed >= 25 ? '#f87171' : c.wind_speed >= 15 ? '#facc15' : '#4ade80',
          }}>
            {c.wind_speed} mph
          </p>
          <p style={{ fontSize: 13, color: '#6b7280' }}>
            {c.wind_direction} wind
            {t?.precipitation_pct > 10 ? ` · ${t.precipitation_pct}% precip` : ''}
          </p>
        </div>
      </div>

      {/* 3-day forecast */}
      {weather.forecast?.length > 0 && (
        <div style={{ padding: '12px 24px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {weather.forecast.map((f, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 0',
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#9ca3af', width: 60 }}>{f.day}</span>
              <span style={{ fontSize: 18 }}>{condEmoji(f.conditions)}</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#f9fafb' }}>{f.high}°</span>
              <span style={{ fontSize: 14, color: '#6b7280' }}>{f.low}°</span>
              {f.precip_pct > 15 && (
                <span style={{ fontSize: 12, color: '#60a5fa' }}>💧{f.precip_pct}%</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Operational alerts */}
      {weather.operational_alerts?.length > 0 && (
        <div style={{
          padding: '12px 24px', borderTop: '1px solid rgba(239,68,68,0.3)',
          background: 'rgba(239,68,68,0.08)',
        }}>
          {weather.operational_alerts.map((a, i) => (
            <p key={i} style={{ fontSize: 13, color: '#f87171', fontWeight: 700, lineHeight: 1.5 }}>
              ⚠️ {a.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Run List: Apparatus cards with assigned crew ─────────────────────────────

// Mirrors isCommandRank() from EventCalendar RunList
function isCommandRank(rank, position) {
  const r = (rank || '').toLowerCase();
  const p = (position || '').toLowerCase();
  return (
    r.includes('battalion') || r.includes('deputy chief') ||
    r === 'chief' || r === 'fire chief' ||
    p.includes('battalion') || p.includes('officer in charge') || p.includes('deputy chief')
  );
}

// Rank-based avatar background — mirrors getRankColor() in EventCalendar
function rankBg(rank) {
  const r = (rank || '').toLowerCase();
  if (r.includes('captain') || r.includes('lieutenant')) return '#b91c1c';
  if (r.includes('chief') || r.includes('bc') || r.includes('dc')) return '#7f1d1d';
  if (r.includes('driver') || r.includes('engineer')) return '#c2410c';
  if (r.includes('paramedic')) return '#065f46';
  if (r.includes('emt')) return '#166534';
  if (r.includes('probationary')) return '#92400e';
  return '#374151';
}

// ─── TV Run List — mirrors The Board's RunList exactly ────────────────────────

function TVRunList({ tvData }) {
  const { members = [], assignments: rawAssignments = [], runList = null } = tvData;

  // Prefer the BC-submitted run list snapshot (saved via "Submit Run List" button).
  // Fall back to live apparatus assignments if no run list has been submitted yet.
  // The submitted run list stores a flat `crew` array in the same shape as apparatus_assignments rows.
  const sourceAssignments = runList?.payload?.crew ?? rawAssignments;
  const submittedAt = runList?.submitted_at ?? null;

  // Deduplicate by member_id — a person can only appear once on the run list
  const seen = new Set();
  const assignments = sourceAssignments.filter(a => {
    const key = a.member_id ?? (a.member_name || '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const hasAssignments = assignments.length > 0;
  // Show a small indicator when the TV is showing a saved run list (submitted by BC)
  const isFromSubmittedRunList = Boolean(runList?.payload?.crew?.length);

  // ── When apparatus assignments exist: use them as the run list ─────────────
  if (hasAssignments) {
    // Separate command staff from apparatus crew (same logic as EventCalendar RunList)
    const command = [];
    const groups  = {};
    const unass   = [];

    for (const m of assignments) {
      const rank     = m.member_rank || '';
      const apName   = (m.apparatus_name || '').trim();
      const position = m.position_name || m.position || '';
      const onUnit   = apName && apName.toLowerCase() !== 'recall';

      if (isCommandRank(rank, position)) {
        command.push(m);
        // BC commanding a unit (e.g. Battalion 1) shows on that unit too.
        if (onUnit) {
          if (!groups[apName]) groups[apName] = [];
          groups[apName].push(m);
        }
        continue;
      }
      if (onUnit) {
        if (!groups[apName]) groups[apName] = [];
        groups[apName].push(m);
      } else {
        unass.push(m);
      }
    }

    const apparatusNames = Object.keys(groups).sort();

    // Command staff role lookups (mirrors EventCalendar)
    const ridingBC = command.find(m => {
      const r = (m.member_rank || '').toLowerCase();
      const p = (m.position_name || m.position || '').toLowerCase();
      return r.includes('battalion') || p.includes('battalion') || p.includes('officer in charge');
    });
    const ridingDC = command.find(m => (m.member_rank || '').toLowerCase().includes('deputy'));
    const fireChief = command.find(m => {
      const r = (m.member_rank || '').toLowerCase();
      return (r === 'chief' || r === 'fire chief') && !r.includes('battalion') && !r.includes('deputy');
    });

    // Find officer/captain inside an apparatus group
    function getOfficer(mems) {
      return mems.find(m => {
        const r = (m.member_rank || '').toLowerCase();
        const p = (m.position_name || m.position || '').toLowerCase();
        return r.includes('captain') || r.includes('lieutenant') || r.includes('chief') || r.includes('battalion') || r === 'bc'
          || p === 'captain' || p.includes('officer') || p.includes('chief') || p.includes('battalion');
      });
    }

    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Submitted indicator ── */}
        {isFromSubmittedRunList && submittedAt && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 8, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', width: 'fit-content' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
            <span style={{ fontSize: 11, color: '#34d399', fontWeight: 700, letterSpacing: 1 }}>
              RUN LIST SUBMITTED · {new Date(submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}

        {/* ── Command Staff ── */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: 3, textTransform: 'uppercase', color: '#6b7280', marginBottom: 10 }}>
            Command Staff
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>

            {[
              { label: 'Riding B/C', color: '#ef4444', bg: '#7f1d1d', border: 'rgba(185,28,28,0.4)', bgCard: 'rgba(185,28,28,0.12)', member: ridingBC, fallback: 'BC' },
              { label: 'Riding D/C', color: '#f97316', bg: '#c2410c', border: 'rgba(194,65,12,0.4)',  bgCard: 'rgba(194,65,12,0.12)',  member: ridingDC, fallback: 'DC' },
              { label: 'Fire Chief', color: '#9ca3af', bg: '#1f2937', border: 'rgba(75,85,99,0.4)',   bgCard: 'rgba(55,65,81,0.12)',   member: fireChief, fallback: 'FC' },
            ].map(({ label, color, bg, border, bgCard, member, fallback }) => (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 16px', borderRadius: 12,
                border: `1px solid ${border}`, background: bgCard,
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10, background: bg, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, fontWeight: 900, color: '#fff',
                }}>
                  {member ? getInitials(member.member_name || member.name) : fallback}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 10, fontWeight: 900, color, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 2 }}>
                    {label}
                  </p>
                  <p style={{ fontSize: 16, fontWeight: 800, color: '#f9fafb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {member
                      ? (member.member_name || member.name)
                      : <span style={{ color: '#6b7280', fontStyle: 'italic', fontWeight: 400, fontSize: 13 }}>Unassigned</span>
                    }
                  </p>
                  {member && <p style={{ fontSize: 11, color: '#9ca3af' }}>{member.member_rank || member.rank}</p>}
                </div>
              </div>
            ))}

          </div>
        </div>

        {/* ── Apparatus in Service ── */}
        {apparatusNames.length > 0 && (
          <div>
            <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: 3, textTransform: 'uppercase', color: '#6b7280', marginBottom: 10 }}>
              Apparatus in Service
              <span style={{ marginLeft: 8, fontWeight: 500, letterSpacing: 0, color: '#4b5563', textTransform: 'none', fontSize: 12 }}>
                {apparatusNames.length} unit{apparatusNames.length !== 1 ? 's' : ''}
              </span>
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
              {apparatusNames.map(apName => {
                const mems    = groups[apName];
                const officer = getOfficer(mems);
                const crew    = mems.filter(m => m !== officer);
                return (
                  <div key={apName} style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                    {/* Dark apparatus header — matches run list style */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 14px', background: '#0f172a',
                      borderBottom: '1px solid rgba(255,255,255,0.08)',
                    }}>
                      <span style={{ fontSize: 16, flexShrink: 0 }}>🚒</span>
                      <span style={{ fontSize: 17, fontWeight: 900, color: '#f9fafb', flex: 1, letterSpacing: 0.5 }}>{apName}</span>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>{mems.length} riding</span>
                    </div>
                    {/* Officer / Captain row */}
                    {officer && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 14px', background: 'rgba(185,28,28,0.15)',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                      }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: 6,
                          background: rankBg(officer.member_rank),
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 900, color: '#fff', flexShrink: 0,
                        }}>
                          {getInitials(officer.member_name || officer.name)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 14, fontWeight: 700, color: '#f3f4f6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {officer.member_name || officer.name}
                          </p>
                          <p style={{ fontSize: 10, color: '#ef4444', fontWeight: 700, textTransform: 'capitalize' }}>
                            {officer.member_rank}
                          </p>
                        </div>
                      </div>
                    )}
                    {/* Remaining crew */}
                    <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 6, background: 'rgba(255,255,255,0.02)' }}>
                      {crew.map((m, i) => {
                        const name = m.member_name || m.name;
                        const rank = m.member_rank || m.rank || 'Firefighter';
                        return (
                          <div key={m.member_id || i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{
                              width: 24, height: 24, borderRadius: 5,
                              background: rankBg(rank),
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 8, fontWeight: 900, color: '#fff', flexShrink: 0,
                            }}>
                              {getInitials(name)}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <p style={{ fontSize: 13, fontWeight: 600, color: '#e5e7eb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
                              <p style={{ fontSize: 10, color: '#6b7280', textTransform: 'capitalize' }}>{rank}</p>
                            </div>
                          </div>
                        );
                      })}
                      {crew.length === 0 && !officer && (
                        <p style={{ fontSize: 12, color: '#4b5563', fontStyle: 'italic' }}>No crew assigned</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Unassigned ── */}
        {unass.length > 0 && (
          <div>
            <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: 3, textTransform: 'uppercase', color: '#6b7280', marginBottom: 8 }}>
              Unassigned
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {unass.map((m, i) => {
                const name = m.member_name || m.name;
                const rank = m.member_rank || m.rank;
                return (
                  <div key={m.member_id || i} style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '6px 12px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                  }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: 5, background: rankBg(rank),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontWeight: 900, color: '#fff', flexShrink: 0,
                    }}>
                      {getInitials(name)}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#d1d5db' }}>{name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Fallback: no assignments yet — show flat on-duty member list ───────────
  const available = members.filter(m => m.available !== false);
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: 3, textTransform: 'uppercase', color: '#6b7280' }}>
        On Duty ({available.length})
      </p>
      <p style={{ fontSize: 14, color: '#4b5563', fontStyle: 'italic' }}>
        No apparatus assignments for today yet. Use the Apparatus Assignment Board to assign crew.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {available.map(m => (
          <div key={m.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '8px 14px',
            border: '1px solid rgba(255,255,255,0.07)',
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              background: rankBg(m.rank),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 800, color: '#fff', flexShrink: 0,
            }}>
              {getInitials(m.name)}
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#f3f4f6', lineHeight: 1.1 }}>{m.name}</p>
              {m.rank && <p style={{ fontSize: 11, color: '#9ca3af', textTransform: 'capitalize' }}>{m.rank}</p>}
            </div>
          </div>
        ))}
        {available.length === 0 && (
          <p style={{ fontSize: 16, color: '#4b5563' }}>No members on duty</p>
        )}
      </div>
    </div>
  );
}

// ─── Sidebar: Readiness + Weather ─────────────────────────────────────────────

function TVSidebar({ summary, weather, tvData }) {
  const sc = summary?.scorecard;
  const statusColor = s => s === 'green' ? '#22c55e' : s === 'red' ? '#ef4444' : '#f59e0b';

  const c = weather?.current;
  const t = weather?.today;

  const condEmoji = cond => {
    const l = (cond || '').toLowerCase();
    if (l.includes('snow')) return '❄️';
    if (l.includes('rain') || l.includes('drizzle')) return '🌧️';
    if (l.includes('thunder')) return '⛈️';
    if (l.includes('cloud') || l.includes('overcast')) return '☁️';
    if (l.includes('fog')) return '🌫️';
    return '☀️';
  };

  const onLeave = (tvData?.members || []).filter(m => m.available === false);

  return (
    <div style={{
      width: 270, flexShrink: 0, display: 'flex', flexDirection: 'column',
      borderLeft: '1px solid rgba(255,255,255,0.07)', overflowY: 'auto',
    }}>
      {/* Readiness metrics */}
      {sc && (
        <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2.5, color: '#6b7280', textTransform: 'uppercase', marginBottom: 10 }}>
            READINESS
          </p>
          {[
            { label: 'STAFFING',  value: `${sc.staffing?.active ?? '—'}`,                          status: sc.staffing?.status },
            { label: 'APPARATUS', value: `${sc.apparatus?.inService ?? '—'}/${sc.apparatus?.total ?? '?'}`, status: sc.apparatus?.status },
            { label: 'TRAINING',  value: `${sc.training?.compliance ?? '—'}%`,                     status: sc.training?.status },
            { label: 'BUDGET',    value: `${sc.budget?.remaining ?? '—'}%`,                        status: sc.budget?.status },
          ].map(({ label, value, status }) => (
            <div key={label} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: statusColor(status || 'green'),
                  boxShadow: `0 0 6px ${statusColor(status || 'green')}66`,
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: 1 }}>{label}</span>
              </div>
              <span style={{ fontSize: 22, fontWeight: 900, color: '#f9fafb', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Weather */}
      {c && (
        <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2.5, color: '#6b7280', textTransform: 'uppercase', marginBottom: 10 }}>
            WEATHER
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 44 }}>{condEmoji(c.conditions)}</span>
            <div>
              <p style={{ fontSize: 48, fontWeight: 900, color: '#f9fafb', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {c.temp}°
              </p>
              <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>{c.conditions}</p>
            </div>
          </div>
          {t && (
            <p style={{ fontSize: 13, color: '#6b7280', marginTop: 8 }}>H {t.high}° · L {t.low}°</p>
          )}
          <div style={{ marginTop: 10, display: 'flex', gap: 14 }}>
            <span style={{ fontSize: 14, color: (c.wind_speed >= 25 ? '#f87171' : '#9ca3af') }}>
              💨 {c.wind_speed} mph
            </span>
            {c.relative_humidity != null && (
              <span style={{ fontSize: 14, color: '#9ca3af' }}>💧 {c.relative_humidity}%</span>
            )}
          </div>
          {weather?.operational_alerts?.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {weather.operational_alerts.map((a, i) => (
                <p key={i} style={{ fontSize: 12, color: '#f87171', fontWeight: 700, lineHeight: 1.5 }}>⚠️ {a.text}</p>
              ))}
            </div>
          )}
          {/* 3-day forecast */}
          {weather?.forecast?.length > 0 && (
            <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
              {weather.forecast.slice(0, 3).map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', width: 36 }}>{f.day}</span>
                  <span style={{ fontSize: 16 }}>{condEmoji(f.conditions)}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#f9fafb' }}>{f.high}°</span>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{f.low}°</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* On Leave */}
      {onLeave.length > 0 && (
        <div style={{ padding: '14px 18px' }}>
          <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2.5, color: '#d97706', textTransform: 'uppercase', marginBottom: 8 }}>
            ON LEAVE ({onLeave.length})
          </p>
          {onLeave.map(m => (
            <p key={m.id} style={{ fontSize: 14, color: '#d97706', marginBottom: 4, lineHeight: 1.3 }}>{m.name}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Incident Mode (full-screen takeover) ─────────────────────────────────────

function IncidentDisplay({ activeBoard, weather, unitStatuses }) {
  const elapsed = useElapsed(activeBoard?.dispatched_at);

  // PAR spine (0048): the station TV shares the command board's PAR countdown.
  // Basis = last completed PAR, else dispatch time — computed live, no scheduler.
  const [parRemaining, setParRemaining] = useState(null); // seconds; <=0 = OVERDUE
  // Rising-edge PAR tone on the watch-desk TV (per-workstation opt-in).
  const prevParRef = useRef(null);
  useEffect(() => {
    const prev = prevParRef.current;
    if (prev != null && prev > 0 && parRemaining != null && parRemaining <= 0) tonePar();
    prevParRef.current = parRemaining;
  }, [parRemaining]);
  useEffect(() => {
    const interval = Number(activeBoard?.par_interval_min) || 0;
    if (!interval) { setParRemaining(null); return; }
    const basis = activeBoard?.last_par_at || activeBoard?.dispatched_at;
    if (!basis) { setParRemaining(null); return; }
    const tick = () => {
      const elapsedSec = Math.floor((Date.now() - new Date(basis).getTime()) / 1000);
      setParRemaining(interval * 60 - elapsedSec);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeBoard?.par_interval_min, activeBoard?.last_par_at, activeBoard?.dispatched_at]);

  const windSpeed = weather?.current?.wind_speed;
  const windColor = !windSpeed ? '#9ca3af'
    : windSpeed < 15 ? '#4ade80'
    : windSpeed < 25 ? '#facc15'
    : windSpeed < 35 ? '#fb923c'
    : '#f87171';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* Red incident header */}
      <div style={{
        background: 'linear-gradient(135deg, #991b1b, #7f1d1d)',
        padding: '32px 40px', borderBottom: '3px solid rgba(239,68,68,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
              <span style={{ fontSize: 36 }}>🚨</span>
              <span style={{
                fontSize: 20, fontWeight: 900, letterSpacing: 4, textTransform: 'uppercase',
                background: 'rgba(255,255,255,0.15)', padding: '6px 18px', borderRadius: 10, color: '#fecaca',
              }}>
                {activeBoard.incident_type || activeBoard.type}
              </span>
              <span style={{
                fontSize: 14, fontWeight: 900, color: '#fca5a5', letterSpacing: 2,
                animation: 'pulse-glow 1.5s infinite',
              }}>
                ACTIVE
              </span>
            </div>
            <p style={{ fontSize: 56, fontWeight: 900, color: '#fff', lineHeight: 1.1, marginBottom: 8 }}>
              {activeBoard.address}
            </p>
            {activeBoard.ic && (
              <p style={{ fontSize: 24, color: '#fca5a5', fontWeight: 600 }}>IC: {activeBoard.ic}</p>
            )}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 40 }}>
            <p style={{ fontSize: 16, color: '#fca5a5', letterSpacing: 3, textTransform: 'uppercase', fontWeight: 800 }}>
              ELAPSED
            </p>
            <p style={{ fontSize: 100, fontWeight: 900, color: '#fff', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {elapsed || '00:00'}
            </p>
            {parRemaining !== null && (
              <p style={{
                marginTop: 10, fontSize: 26, fontWeight: 900, letterSpacing: 2,
                fontVariantNumeric: 'tabular-nums', borderRadius: 12, padding: '6px 16px',
                display: 'inline-block',
                background: parRemaining <= 0 ? '#ef4444' : parRemaining <= 120 ? '#f97316' : 'rgba(255,255,255,0.15)',
                color: '#fff',
                animation: parRemaining <= 120 ? 'pulse-glow 1.5s infinite' : 'none',
              }}>
                {parRemaining <= 0
                  ? 'PAR OVERDUE'
                  : `PAR IN ${Math.floor(parRemaining / 60)}:${String(parRemaining % 60).padStart(2, '0')}`}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {[
          { label: 'UNITS', value: activeBoard.units_count ?? '—' },
          { label: 'PERSONNEL', value: activeBoard.personnel_count ?? '—' },
        ].map(({ label, value }) => (
          <div key={label} style={{
            flex: 1, padding: '28px 40px', textAlign: 'center',
            borderRight: '1px solid rgba(255,255,255,0.08)',
          }}>
            <p style={{ fontSize: 72, fontWeight: 900, color: '#f9fafb', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
            <p style={{ fontSize: 18, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 3, marginTop: 6, fontWeight: 800 }}>{label}</p>
          </div>
        ))}
        {/* Wind conditions */}
        <div style={{ flex: 1.5, padding: '28px 40px', textAlign: 'center' }}>
          {windSpeed != null ? (
            <>
              <p style={{ fontSize: 72, fontWeight: 900, color: windColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {windSpeed} <span style={{ fontSize: 28 }}>mph</span>
              </p>
              <p style={{ fontSize: 18, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 3, marginTop: 6, fontWeight: 800 }}>
                WIND {weather?.current?.wind_direction ? `· ${weather.current.wind_direction}` : ''}
              </p>
              {windSpeed >= 25 && (
                <p style={{ fontSize: 16, color: '#fb923c', marginTop: 8, fontWeight: 800 }}>
                  ⚠️ HIGH WIND — MAY AFFECT FIRE BEHAVIOR
                </p>
              )}
            </>
          ) : (
            <>
              <p style={{ fontSize: 32, color: '#4b5563' }}>—</p>
              <p style={{ fontSize: 18, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 3, marginTop: 6 }}>WIND</p>
            </>
          )}
        </div>
      </div>

      {/* Dispatch time + FaceTime */}
      <div style={{ padding: '20px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1 }}>
        <span style={{ fontSize: 20, color: '#6b7280' }}>
          Dispatched: {activeBoard.dispatched_at
            ? new Date(activeBoard.dispatched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
            : '—'}
        </span>
        {activeBoard.ic_facetime && (
          <a
            href={`facetime:${activeBoard.ic_facetime}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: '#34c759', color: '#fff',
              padding: '14px 32px', borderRadius: 16,
              fontSize: 24, fontWeight: 900, textDecoration: 'none',
            }}
          >
            📹 FaceTime IC
          </a>
        )}
      </div>

      {/* Live unit status strip during the incident (Phase 2) */}
      <TVUnitStatus tvData={{ unitStatuses }} />
    </div>
  );
}

// ─── Live Unit Status strip (Phase 2 — TV mirror) ────────────────────────────
// Glanceable: highlights committed units working a call (not in_service/returning/on_the_air/OOS);
// when everything is in service it collapses to a calm one-line summary.

const TV_STATUS_COLORS = {
  in_service:     { bg: '#0c3b22', br: '#1f7a3d', tx: '#86efac', label: 'In Service' },
  dispatched:     { bg: '#3d2a07', br: '#b45309', tx: '#fcd34d', label: 'Dispatched' },
  enroute:        { bg: '#0c2a5e', br: '#1d4ed8', tx: '#93c5fd', label: 'En Route' },
  on_scene:       { bg: '#4a0d0d', br: '#dc2626', tx: '#fca5a5', label: 'On Scene' },
  returning:      { bg: '#042f2e', br: '#0d9488', tx: '#5eead4', label: 'In Service · Returning' },
  on_the_air:     { bg: '#083344', br: '#0891b2', tx: '#67e8f9', label: 'On the Air' },
  transporting:   { bg: '#3b0764', br: '#a855f7', tx: '#d8b4fe', label: 'Transporting' },
  at_hospital:    { bg: '#172554', br: '#3b82f6', tx: '#93c5fd', label: 'At Hospital' },
  out_of_service: { bg: '#1f2937', br: '#4b5563', tx: '#9ca3af', label: 'Out of Service' },
};

function TVUnitStatus({ tvData }) {
  const units = Array.isArray(tvData?.unitStatuses) ? tvData.unitStatuses : [];
  if (!units.length) return null;
  const active = units.filter((u) => u.status && !['in_service', 'returning', 'on_the_air', 'out_of_service'].includes(u.status));
  const availableCount = units.filter((u) => ['in_service', 'returning', 'on_the_air'].includes(u.status)).length;

  return (
    <div style={{ flexShrink: 0, borderTop: '2px solid #1f2937', background: '#0a0e14', padding: '10px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: active.length ? 8 : 0 }}>
        <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: 2, color: '#9ca3af' }}>UNIT STATUS</span>
        {active.length === 0 ? (
          <span style={{ fontSize: 18, fontWeight: 800, color: '#86efac' }}>
            ● All {units.length} units in service
          </span>
        ) : (
          <span style={{ fontSize: 14, fontWeight: 700, color: '#6b7280' }}>
            {active.length} working · {availableCount} available
          </span>
        )}
      </div>
      {active.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {active.map((u) => {
            const c = TV_STATUS_COLORS[u.status] || TV_STATUS_COLORS.in_service;
            return (
              <div key={(u.apparatus_id ?? 'x') + u.designation}
                style={{ background: c.bg, border: `2px solid ${c.br}`, borderRadius: 10, padding: '6px 12px', display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>{u.designation}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: c.tx, textTransform: 'uppercase', letterSpacing: 0.5 }}>{c.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Standby Mode: Run List View ─────────────────────────────────────────────

function StandbyDisplay({ tvData, briefing, summary, weather }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* AI Briefing strip */}
      <TVBriefingStrip briefing={briefing} />

      {/* Main content: Apparatus run list + Sidebar */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <TVRunList tvData={tvData} />
        <TVSidebar summary={summary} weather={weather} tvData={tvData} />
      </div>

      {/* Live unit status strip (Phase 2) */}
      <TVUnitStatus tvData={tvData} />
    </div>
  );
}

// ─── TV Radio Ticker ──────────────────────────────────────────────────────────
// Displays the last few radio transmissions as a horizontal ticker bar.
// Uses inline styles to match TVDisplay's existing pattern.

const TG_DOT_COLORS = {
  'Fire Dispatch': '#ef4444',
  'Fireground Tac 1': '#f97316',
  'Fireground Tac 2': '#f59e0b',
  'EMS': '#22c55e',
  'Mutual Aid': '#a855f7',
  'Command': '#3b82f6',
};

function TVRadioTicker({ radioFeed = [], pin }) {
  const [wsEntries, setWsEntries] = useState([]);
  const wsRef = useRef(null);

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!pin) return;
    let mounted = true;
    const wsProto = API_BASE.startsWith('https') ? 'wss' : (API_BASE ? 'ws' : (window.location.protocol === 'https:' ? 'wss' : 'ws'));
    const host = API_BASE ? API_BASE.replace(/^https?:\/\//, '') : window.location.host;
    const url = `${wsProto}://${host}/ws/radio`;

    let reconnectTimer = null;
    let attempts = 0;
    const scheduleReconnect = () => {
      if (!mounted) return;
      attempts += 1;
      // Exponential backoff capped at 5 min. `/ws/radio` doesn't exist on
      // serverless (Vercel has no persistent WS), so without a cap this would
      // reconnect every 5s forever and slowly churn a 24/7 wall display. The
      // ticker falls back to the polled radioFeed, so a dead WS is harmless.
      reconnectTimer = setTimeout(connect, reconnectDelay(attempts));
    };
    const connect = () => {
      if (!mounted) return;
      let ws;
      try { ws = new WebSocket(url); } catch (_) { scheduleReconnect(); return; }
      wsRef.current = ws;
      ws.onopen = () => { attempts = 0; try { ws.send(JSON.stringify({ type: 'auth', pin })); } catch (_) {} };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'radio' && mounted) {
            setWsEntries(prev => [msg.data, ...prev].slice(0, 10));
          }
        } catch (_) {}
      };
      ws.onclose = () => { if (mounted) scheduleReconnect(); };
      ws.onerror = () => { try { ws.close(); } catch (_) {} };
    };
    connect();
    return () => {
      mounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) { try { wsRef.current.onclose = null; wsRef.current.close(); } catch (_) {} }
    };
  }, [pin]);

  const displayEntries = wsEntries.length > 0 ? wsEntries.slice(0, 5) : (radioFeed || []).slice(0, 5);
  if (displayEntries.length === 0) return null;

  return (
    <div style={{
      padding: '10px 40px',
      borderTop: '1px solid rgba(255,255,255,0.08)',
      background: 'rgba(0,0,0,0.3)',
      display: 'flex',
      alignItems: 'center',
      gap: 20,
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 14, color: '#ef4444', fontWeight: 700 }}>RADIO</span>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', animation: 'pulse-glow 2s infinite' }} />
      </div>
      <div style={{ display: 'flex', gap: 24, overflow: 'hidden', flex: 1 }}>
        {displayEntries.map((entry, i) => (
          <div key={entry.id || i} style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, maxWidth: '33%' }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: TG_DOT_COLORS[entry.talkgroup] || '#6b7280',
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 700, whiteSpace: 'nowrap' }}>
              {entry.talkgroup || 'UNK'}
            </span>
            <span style={{
              fontSize: 13, color: '#d1d5db', whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 400,
            }}>
              {entry.transcript}
            </span>
            <span style={{ fontSize: 11, color: '#4b5563', whiteSpace: 'nowrap' }}>
              {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main TV Display ──────────────────────────────────────────────────────────

const TV_DEVICE_TOKEN_KEY = 'of_tv_device_token';
function readDeviceToken() {
  try { return localStorage.getItem(TV_DEVICE_TOKEN_KEY) || ''; } catch (_) { return ''; }
}

export default function TVDisplay({ pin }) {
  const now = useNow();
  const [error, setError] = useState(null);
  // Station displays bind to ONE station via a pairing code (migration 0074), the
  // registered upgrade of the shared PIN. The device token is sent as the
  // `x-device-token` HEADER — never the query string (a bearer credential must not
  // leak into logs/Referer). PIN via ?pin= stays as the legacy fallback.
  const [deviceToken, setDeviceToken] = useState(readDeviceToken);
  const [pairing, setPairing] = useState(false);

  // One-time pairing: a display is launched at /tv?pair=CODE. Redeem the single-use
  // code (public route), persist the returned device token, then drop the param.
  useEffect(() => {
    let cancelled = false;
    const code = new URLSearchParams(window.location.search).get('pair');
    if (!code || readDeviceToken()) return undefined;
    setPairing(true);
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/station-displays/pair`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const body = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && body?.data?.device_token) {
          try { localStorage.setItem(TV_DEVICE_TOKEN_KEY, body.data.device_token); } catch (_) { /* private mode */ }
          setDeviceToken(body.data.device_token);
          // Strip the one-time code from the URL so a refresh doesn't re-redeem it.
          const url = new URL(window.location.href);
          url.searchParams.delete('pair');
          window.history.replaceState({}, '', url.toString());
        } else if (!cancelled) {
          setError('Pairing failed — ask a chief for a fresh code.');
        }
      } catch (_) {
        if (!cancelled) setError('Pairing failed — check the connection and retry.');
      } finally {
        if (!cancelled) setPairing(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch helper — optional custom headers (used to carry the device token).
  const fetchJSON = async (url, headers) => {
    const res = await fetch(`${API_BASE}${url}`, headers ? { headers } : undefined);
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  };

  // TV data (members, apparatus, run list, active-board, unit statuses).
  // Imperative fetch so the realtime handler can refetch directly (same pattern
  // as the dashboard's load()). Local date so the server finds today's run list.
  const [tvData, setTvData] = useState(null);
  const fetchTvData = useCallback(async () => {
    if (!pin && !deviceToken) return;
    const d = new Date();
    const localDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    try {
      const data = deviceToken
        ? await fetchJSON(`/api/tv-data?date=${localDate}`, { 'x-device-token': deviceToken })
        : await fetchJSON(`/api/tv-data?pin=${encodeURIComponent(pin)}&date=${localDate}`);
      setTvData(data); setError(null);
    } catch (e) {
      // A revoked/expired token is unrecoverable on the device — clear it so the
      // screen falls back to its pairing prompt instead of looping on 401.
      if (deviceToken && String(e.message) === '401') {
        try { localStorage.removeItem(TV_DEVICE_TOKEN_KEY); } catch (_) { /* noop */ }
        setDeviceToken('');
      }
      setError(e.message);
    }
  }, [pin, deviceToken]);

  // Initial load + 15s backstop poll.
  useEffect(() => {
    fetchTvData();
    const id = setInterval(fetchTvData, 15000);
    return () => clearInterval(id);
  }, [fetchTvData]);

  // PRIMARY realtime: subscribe to the DEPARTMENT's Supabase broadcast (P6.2;
  // public anon key — no JWT, works on the PIN-only TV). On 'changed', refetch.
  const departmentId = tvData?.station?.departmentId;
  useEffect(() => {
    const topic = unitStatusTopic(departmentId);
    if (!topic || !supabase) return undefined; // no dept or no realtime client → poll backstops
    const channel = supabase
      .channel(topic)
      .on('broadcast', { event: 'changed' }, () => { reportMessageReceived(); fetchTvData(); })
      .subscribe((status) => reportChannelStatus(topic, status));
    return () => { forgetChannel(topic); supabase.removeChannel(channel); };
  }, [departmentId, fetchTvData]);

  // Digital-signage safety: a TV runs 24/7 for days. Browsers accumulate state
  // over that long a session, so every 6h we do a full reload to flush it —
  // but NEVER during an active incident (a mid-call screen flash is unacceptable).
  const activeRef = useRef(false);
  activeRef.current = !!tvData?.activeBoard;
  useEffect(() => {
    const SIX_HOURS = 6 * 60 * 60 * 1000;
    const id = setInterval(() => { if (!activeRef.current) window.location.reload(); }, SIX_HOURS);
    return () => clearInterval(id);
  }, []);

  // AI briefing — 5-minute refresh
  const briefing = useAutoRefresh(() => fetchJSON('/api/dashboard/briefing').catch(() => null), 300000);

  // Dashboard summary (readiness cards) — 60s refresh
  const summary = useAutoRefresh(() => fetchJSON('/api/dashboard/summary').catch(() => null), 60000);

  // Today's timeline — 60s refresh
  const timeline = useAutoRefresh(() => fetchJSON('/api/dashboard/today').catch(() => null), 60000);

  // Weather — 10-minute refresh
  const weather = useAutoRefresh(() => fetchJSON('/api/weather/current').catch(() => null), 600000);

  // ── Error / loading states ──
  if (pairing) {
    return (
      <div style={outerStyle}>
        <div style={centerStyle}>
          <p style={{ fontSize: 32, color: '#6b7280' }}>Pairing this display…</p>
        </div>
      </div>
    );
  }

  if (!pin && !deviceToken) {
    return (
      <div style={outerStyle}>
        <div style={centerStyle}>
          <p style={{ fontSize: 36, color: '#ef4444', fontWeight: 700 }}>This display isn’t paired</p>
          <p style={{ fontSize: 22, color: '#6b7280', marginTop: 12 }}>
            In <strong>Station Settings → Station Displays</strong>, create a display and open its
            pairing link on this screen, or use a TV PIN.
          </p>
        </div>
      </div>
    );
  }

  if (error && !tvData) {
    return (
      <div style={outerStyle}>
        <div style={centerStyle}>
          <p style={{ fontSize: 36, color: '#ef4444', fontWeight: 700 }}>⚠ Connection Error</p>
          <p style={{ fontSize: 20, color: '#6b7280', marginTop: 12 }}>
            {deviceToken
              ? 'This display may have been revoked — ask a chief to re-pair it.'
              : 'Check your TV PIN in Station Settings and try again.'}
          </p>
          <p style={{ fontSize: 16, color: '#4b5563', marginTop: 8 }}>
            {deviceToken ? 'Paired display' : `PIN: ${pin}`} · Retrying every 15s…
          </p>
        </div>
      </div>
    );
  }

  if (!tvData) {
    return (
      <div style={outerStyle}>
        <div style={centerStyle}>
          <p style={{ fontSize: 32, color: '#6b7280' }}>Connecting to station…</p>
        </div>
      </div>
    );
  }

  const isIncident = Boolean(tvData.activeBoard);

  return (
    <div style={outerStyle}>
      <style>{`
        @keyframes pulse-glow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      <TVHeader now={now} station={tvData.station} />

      {isIncident
        ? <ScreenErrorBoundary label="Incident Display">
            <IncidentDisplay activeBoard={tvData.activeBoard} weather={weather} unitStatuses={tvData.unitStatuses} />
          </ScreenErrorBoundary>
        : <ScreenErrorBoundary label="Standby Display">
            <StandbyDisplay tvData={tvData} briefing={briefing} summary={summary} weather={weather} />
          </ScreenErrorBoundary>
      }

      {/* Radio ticker */}
      <ScreenErrorBoundary label="Radio Ticker">
        <TVRadioTicker radioFeed={tvData.radioFeed || []} pin={pin} />
      </ScreenErrorBoundary>

      {/* Footer */}
      <div style={{
        padding: '8px 40px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 13 }}>
          <span style={{ color: '#374151', fontWeight: 700 }}>OPEN</span>
          <span style={{ color: '#ef4444', fontWeight: 700 }}>FIREHOUSE</span>
          <span style={{ color: '#6b7280' }}> TV</span>
        </span>
        <span style={{ fontSize: 13, color: '#374151' }}>
          {isIncident ? '🔴 INCIDENT ACTIVE' : '● Standby'} · Auto-refresh active
        </span>
      </div>
    </div>
  );
}

const outerStyle = {
  minHeight: '100vh',
  background: '#0f1117',
  color: '#f9fafb',
  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
  display: 'flex',
  flexDirection: 'column',
};

const centerStyle = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: 40,
};
