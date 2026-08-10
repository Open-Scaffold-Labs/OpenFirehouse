import { useState, useEffect, useCallback } from 'react';
import {
  Truck, Users, Trash2, Loader2, AlertTriangle,
  Calendar, ChevronLeft, ChevronRight, Settings, CheckCircle, Save,
} from 'lucide-react';
import { api } from '../utils/api';
import { isOfficerPlus } from '../data/auth';

// ── Rank relevance scoring ─────────────────────────────────────────────────
// Returns a lower number for ranks that are a better fit for the position.
// Used to sort members within each group so the right people surface first.

function rankScore(rank, positionName) {
  const pos = (positionName || '').toLowerCase();
  const r   = (rank || '').toLowerCase();

  // Battalion Chief / Group Commander slot
  if (pos.includes('battalion') || pos.includes(' bc')) {
    if (r.includes('battalion') || r.includes(' bc')) return 0;
    if (r.includes('deputy') || r.includes('chief'))   return 1;
    if (r.includes('captain'))                         return 2;
    return 3;
  }

  // Officer / Captain slot — "Officer" is what the DB uses for captain-riding positions
  if (pos.includes('captain') || pos.includes('officer') || pos.includes('company')) {
    if (r.includes('captain'))                           return 0;
    if (r.includes('lieutenant'))                        return 1;
    if (r.includes('engineer') || r.includes('driver')) return 2;
    if (r.includes('firefighter') || r.includes('paramedic') || r.includes('emt')) return 3;
    return 4;
  }

  // Driver / Engineer / Pump Operator slot
  if (pos.includes('driver') || pos.includes('engineer') || pos.includes('operator') || pos.includes('pump')) {
    if (r.includes('engineer') || r.includes('driver')) return 0;
    if (r.includes('firefighter') || r.includes('paramedic') || r.includes('emt')) return 1;
    if (r.includes('captain') || r.includes('lieutenant'))                          return 2;
    return 3;
  }

  // Paramedic / EMS slot
  if (pos.includes('paramedic') || pos.includes('ems') || pos.includes('medic')) {
    if (r.includes('paramedic'))                        return 0;
    if (r.includes('emt'))                              return 1;
    if (r.includes('firefighter'))                      return 2;
    return 3;
  }

  // Default — Nozzle, Backup, Vent, Search, Rescue, etc.
  if (r.includes('firefighter') || r.includes('paramedic') || r.includes('emt')) return 0;
  if (r.includes('engineer') || r.includes('driver'))                             return 1;
  if (r.includes('probationary'))                                                  return 2;
  return 3;
}

// ── Qualification badge ─────────────────────────────────────────────────────
// Driven by the server scoring (GET /apparatus-assignments/staffing) — the SAME
// scoring lib as the incident staffing board. We do NOT re-score in the browser.
function QualBadge({ seat }) {
  if (!seat) return null;
  // P4: a responder who filled the seat but couldn't be resolved to a member by a
  // STABLE id is NOT scored (never silently mis-scored). It gets its OWN distinct
  // token — rose, deliberately different from "open" (gray) and "partial" (amber)
  // — so command sees "this person responded but isn't confirmed in the roster".
  if (seat.filledBy && seat.filledBy.unlinked) {
    return (
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
        title="Responded but not linked to a roster member — confirm in Roster setup">
        Unlinked
      </span>
    );
  }
  const map = {
    qualified:  { label: 'Qualified',  cls: 'bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-300' },
    partial:    { label: 'Partial',    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' },
    unverified: { label: 'Unverified', cls: 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
    open:       { label: 'Open',       cls: 'bg-gray-100 text-gray-600 dark:text-gray-400 dark:bg-gray-900 dark:text-gray-500' },
  };
  const m = map[seat.qualification] || map.open;
  return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${m.cls}`}>{m.label}</span>;
}

// ── Position card ─────────────────────────────────────────────────────────────
// availableMembers — full active roster minus already-assigned on this apparatus
// shiftCrewIds     — Set of member IDs scheduled on today's shift (may be empty)
// seat             — server qualification result for this position (may be undefined)

// `canEdit` mirrors the server's `requireOfficer` on every apparatus-assignments write
// (added 2026-07-27 with the gate). The SERVER is the control — this only decides what we
// OFFER, so a firefighter is never shown a seat picker whose every use is refused. The
// board stays fully READABLE to the crew: they have to be able to see what they are riding.
function PositionSlot({ position, assignment, seat, availableMembers, shiftCrewIds, onAssign, onRemove, canEdit }) {
  // Split into two tiers sorted by rank relevance within each tier
  const sorter = (a, b) => rankScore(a.rank, position.position_name) - rankScore(b.rank, position.position_name);
  const onShift  = availableMembers.filter(m =>  shiftCrewIds.has(m.id)).sort(sorter);
  const offShift = availableMembers.filter(m => !shiftCrewIds.has(m.id)).sort(sorter);
  const hasGroups = onShift.length > 0;

  // Friendly label for the "all members" group based on the position type
  const pos = (position.position_name || '').toLowerCase();
  const rosterLabel = pos.includes('battalion') || pos.includes(' bc')
    ? 'Battalion Chiefs / Chiefs'
    : pos.includes('captain') || pos.includes('officer') || pos.includes('company')
    ? 'Captains / Officers'
    : pos.includes('driver') || pos.includes('engineer') || pos.includes('operator') || pos.includes('pump')
    ? 'Drivers / Engineers'
    : pos.includes('paramedic') || pos.includes('ems') || pos.includes('medic')
    ? 'Paramedics / EMTs'
    : 'Firefighters / Crew';

  return (
    <div className={`rounded-lg border px-3 py-2 ${
      assignment ? 'bg-green-50 dark:bg-green-950/50 border-green-200 dark:border-green-900' : 'bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-700 border-dashed'
    }`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {position.position_name}
        </span>
        <div className="flex items-center gap-1.5">
          {assignment && <QualBadge seat={seat} />}
          {position.min_rank && (
            <span className="text-[9px] text-gray-600 dark:text-gray-400">Min: {position.min_rank}</span>
          )}
        </div>
      </div>
      {seat?.requiredCertLabels?.length > 0 && (
        <p className="text-[9px] text-gray-600 dark:text-gray-400 mb-1 leading-tight">Certs: {seat.requiredCertLabels.join(', ')}</p>
      )}

      {assignment ? (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">{assignment.member_name}</p>
            <p className="text-[10px] text-gray-600 dark:text-gray-400">
              {seat?.filledBy?.displayRank || assignment.member_rank}
              {seat?.filledBy?.acting && <span className="ml-1 text-amber-700 dark:text-amber-400 font-semibold">· Acting</span>}
            </p>
            {seat?.qualification === 'partial' && seat.missingCertLabels?.length > 0 && (
              <p className="text-[9px] text-amber-700 dark:text-amber-400 leading-tight">Missing: {seat.missingCertLabels.join(', ')}</p>
            )}
            {seat?.qualification === 'partial' && (!seat.missingCertLabels || seat.missingCertLabels.length === 0) && seat.rankMet === false && (
              <p className="text-[9px] text-amber-700 dark:text-amber-400 leading-tight">Under minimum rank</p>
            )}
            {seat?.qualification === 'unverified' && !seat?.filledBy?.unlinked && (
              <p className="text-[9px] text-gray-600 dark:text-gray-400 leading-tight">No cert records on file</p>
            )}
            {seat?.filledBy?.unlinked && (
              <p className="text-[9px] text-rose-600 dark:text-rose-400 leading-tight">Not linked — confirm in Roster setup</p>
            )}
            {seat?.filledBy?.plannedCrewName && (
              <p className="text-[9px] text-gray-600 dark:text-gray-400 leading-tight">Planned: {seat.filledBy.plannedCrewName}</p>
            )}
          </div>
          {canEdit && (
            <button onClick={() => onRemove(assignment.id)}
              aria-label={`Remove ${assignment.member_name} from ${position.position_name}`}
              title={`Remove ${assignment.member_name} from ${position.position_name}`}
              className="p-1 rounded text-gray-600 dark:text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50">
              <Trash2 size={11} />
            </button>
          )}
        </div>
      ) : !canEdit ? (
        // An open seat, read-only. Still shown — an empty seat is information the crew
        // needs — but without a picker that the server would refuse.
        <p className="text-xs text-gray-600 dark:text-gray-400 dark:text-gray-500 italic px-2 py-1">Open seat</p>
      ) : (
        // Always render the select directly — no toggle state.
        // The old "click to show select" pattern caused onBlur to fire
        // before onChange, unmounting the select before the pick registered.
        <select
          value=""
          onChange={e => {
            if (e.target.value) onAssign(position, parseInt(e.target.value));
          }}
          aria-label={`Assign member to ${position.position_name}`}
          className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-gray-500 dark:text-gray-400 dark:bg-gray-900"
        >
          <option value="">Assign member…</option>
          {hasGroups ? (
            <>
              <optgroup label={`— On Shift: ${rosterLabel} —`}>
                {onShift.map(m => (
                  <option key={m.id} value={m.id}>{m.name} — {m.rank}</option>
                ))}
              </optgroup>
              {offShift.length > 0 && (
                <optgroup label="— Full Roster —">
                  {offShift.map(m => (
                    <option key={m.id} value={m.id}>{m.name} — {m.rank}</option>
                  ))}
                </optgroup>
              )}
            </>
          ) : (
            <>
              <optgroup label={`— ${rosterLabel} —`}>
                {offShift.filter(m => rankScore(m.rank, position.position_name) === 0).map(m => (
                  <option key={m.id} value={m.id}>{m.name} — {m.rank}</option>
                ))}
              </optgroup>
              {offShift.some(m => rankScore(m.rank, position.position_name) > 0) && (
                <optgroup label="— All Others —">
                  {offShift.filter(m => rankScore(m.rank, position.position_name) > 0).map(m => (
                    <option key={m.id} value={m.id}>{m.name} — {m.rank}</option>
                  ))}
                </optgroup>
              )}
            </>
          )}
        </select>
      )}
    </div>
  );
}

// ── Apparatus card ────────────────────────────────────────────────────────────

function ApparatusCard({ apparatus, positions, assignments, staffing, availableMembers, shiftCrewIds, onAssign, onRemove, canEdit }) {
  const filledCount = assignments.length;
  const totalSlots = positions.length;
  const isFull = totalSlots > 0 && filledCount >= totalSlots;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className={`flex items-center justify-between px-4 py-3 border-b ${
        isFull ? 'bg-green-50 dark:bg-green-950/50 border-green-100 dark:border-green-900' : totalSlots > 0 ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-100 dark:border-amber-900' : 'bg-gray-50 dark:bg-gray-950 border-gray-100 dark:border-gray-700'
      }`}>
        <div className="flex items-center gap-2">
          <Truck size={16} className={isFull ? 'text-green-700 dark:text-green-300' : 'text-gray-600 dark:text-gray-300'} />
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{apparatus.designation}</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">{apparatus.type} · {apparatus.status}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Users size={12} className="text-gray-600 dark:text-gray-400" />
          <span className={`text-xs font-bold ${isFull ? 'text-green-700 dark:text-green-300' : filledCount > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-gray-600 dark:text-gray-400'}`}>
            {filledCount}/{totalSlots}
          </span>
          {isFull && <CheckCircle size={12} className="text-green-500" />}
        </div>
      </div>

      <div className="p-3 space-y-2">
        {positions.length === 0 ? (
          <p className="text-xs text-gray-600 dark:text-gray-400 italic py-2 text-center">
            No positions defined. Set up positions in Apparatus Tracker.
          </p>
        ) : (
          positions.map(pos => {
            const assignment = assignments.find(a => a.position_name === pos.position_name || a.position_id === pos.id);
            const alreadyAssigned = assignments.map(a => a.member_id);
            const available = availableMembers.filter(m => !alreadyAssigned.includes(m.id));
            return (
              <PositionSlot canEdit={canEdit}
                key={pos.id}
                position={pos}
                assignment={assignment}
                seat={staffing?.[pos.id]}
                availableMembers={available}
                shiftCrewIds={shiftCrewIds}
                onAssign={onAssign}
                onRemove={onRemove}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ApparatusAssignmentBoard({ onNavigate, selectedStation = null, stations = [], currentUser = null }) {
  // Mirrors the server's requireOfficer on every write here. Server is the control.
  const canEdit = isOfficerPlus(currentUser);
  // Per-station grain: a multi-house dept must publish to ONE house. With "All
  // Houses" selected the server would 400 STATION_REQUIRED — guard proactively.
  const isMultiHouse = Array.isArray(stations) && stations.length > 1;
  const needsStation = isMultiHouse && !selectedStation;
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [shifts, setShifts] = useState([]);
  const [selectedShift, setSelectedShift] = useState(null);
  const [apparatus, setApparatus] = useState([]);
  const [positions, setPositions] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [staffing, setStaffing] = useState({}); // positionId → server qualification result
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'

  const fetchBase = useCallback(async () => {
    try {
      const [aRes, mRes, pRes] = await Promise.all([
        api.get('/api/apparatus'),
        api.get('/api/members'),
        api.get('/api/apparatus-assignments/positions'),
      ]);
      const apparatus = Array.isArray(aRes?.data) ? aRes.data : Array.isArray(aRes) ? aRes : [];
      const members = Array.isArray(mRes?.data) ? mRes.data : Array.isArray(mRes) ? mRes : [];
      const positions = Array.isArray(pRes?.data) ? pRes.data : Array.isArray(pRes) ? pRes : [];
      setApparatus(apparatus.filter(a => a.status === 'In Service'));
      setMembers(members.filter(m => m.status === 'Active' || m.status === 'Probationary'));
      setPositions(positions);
    } catch (err) {
      console.error('Failed to load base data:', err);
    }
  }, []);

  const fetchShifts = useCallback(async () => {
    try {
      const raw = await api.get(`/api/shifts?date=${date}`);
      const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      const dayShifts = arr.filter(s => s.date === date);
      setShifts(dayShifts);
      if (dayShifts.length > 0 && !selectedShift) {
        setSelectedShift(dayShifts[0]);
      } else if (dayShifts.length > 0 && selectedShift) {
        const updated = dayShifts.find(s => s.id === selectedShift.id);
        if (updated) setSelectedShift(updated);
        else setSelectedShift(dayShifts[0]);
      } else {
        setSelectedShift(null);
      }
    } catch (err) {
      console.error('Failed to load shifts:', err);
    }
  }, [date]);

  const fetchAssignments = useCallback(async () => {
    if (!selectedShift) { setAssignments([]); return; }
    try {
      const raw = await api.get(`/api/apparatus-assignments?shift_id=${selectedShift.id}&_=${Date.now()}`);
      const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      setAssignments(arr);
    } catch (err) {
      console.error('Failed to load assignments:', err);
    }
  }, [selectedShift]);

  // Qualification scoring comes from the server (single source of truth) —
  // never re-scored in the browser. Refreshed whenever the assignment set changes.
  const fetchStaffing = useCallback(async () => {
    if (!selectedShift) { setStaffing({}); return; }
    try {
      const raw = await api.get(`/api/apparatus-assignments/staffing?shift_id=${selectedShift.id}&_=${Date.now()}`);
      const data = raw?.data ?? raw ?? {};
      const map = {};
      for (const ap of (data.apparatus || [])) {
        for (const seat of (ap.positions || [])) map[seat.positionId] = seat;
      }
      setStaffing(map);
    } catch (err) {
      console.error('Failed to load staffing:', err);
    }
  }, [selectedShift]);

  useEffect(() => { fetchBase().then(() => setLoading(false)); }, [fetchBase]);
  useEffect(() => { fetchShifts(); }, [fetchShifts]);
  useEffect(() => { fetchAssignments(); }, [fetchAssignments]);
  useEffect(() => { fetchStaffing(); }, [fetchStaffing, assignments]);

  function changeDate(offset) {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + offset);
    setDate(d.toISOString().slice(0, 10));
  }

  async function handleAssign(position, memberId) {
    if (!selectedShift) return;
    const member = members.find(m => m.id === memberId);
    if (!member) return;

    // Optimistic update — fill the slot immediately so the UI responds instantly.
    // We use a temp ID that gets replaced by the real server ID once the POST completes.
    const tempId = `temp-${Date.now()}`;
    const optimistic = {
      id: tempId,
      member_id: memberId,
      member_name: member.name,
      member_rank: member.rank,
      apparatus_id: position.apparatus_id,
      position_id: position.id,
      position_name: position.position_name,
    };

    // Remove any existing assignment for this specific slot (same apparatus + same position)
    // AND remove any existing assignment for this same member anywhere (they move, not duplicate).
    // Scoping the slot removal by apparatus_id prevents same-named positions on different
    // apparatus (e.g. "Officer" on Engine 1 vs Engine 2) from wiping each other out.
    setAssignments(prev => [
      ...prev.filter(a =>
        // Keep if NOT the slot being filled on this apparatus
        !(a.apparatus_id === position.apparatus_id &&
          (a.position_name === position.position_name || a.position_id === position.id))
        &&
        // Keep if NOT an existing assignment for the same member (member moves, not duplicates)
        a.member_id !== memberId
      ),
      optimistic,
    ]);

    try {
      const result = await api.post('/api/apparatus-assignments', {
        shift_id: selectedShift.id,
        apparatus_id: position.apparatus_id,
        position_id: position.id,
        member_id: memberId,
        position_name: position.position_name,
      });
      // Swap the temp entry for the real row returned by the server.
      // This gives us the correct real ID so the trash button can delete it.
      // We do NOT call fetchAssignments() here — that would race the optimistic
      // state and could briefly flash the slot back to empty.
      const realRow = result?.data ?? result ?? {};
      setAssignments(prev => prev.map(a =>
        a.id === tempId
          ? { ...a, id: realRow.id ?? tempId }
          : a
      ));
    } catch (err) {
      // Revert on failure
      setAssignments(prev => prev.filter(a => a.id !== tempId));
      alert(err.message || 'Failed to assign');
    }
  }

  async function saveToBoard() {
    if (!selectedShift || assignments.length === 0) return;
    if (needsStation) { setSaveState('needs-station'); return; }
    setSaveState('saving');
    try {
      // Enrich each assignment with apparatus_name so the TV display can group by rig
      const crew = assignments.map(a => {
        const rig = apparatus.find(ap => ap.id === a.apparatus_id);
        const posDef = positions.find(p => p.id === a.position_id);
        // Carry the seat's min_rank so the run list can derive acting titles
        // (A/C / A/L) for officers riding up.
        return { ...a, apparatus_name: rig?.designation ?? a.apparatus_name ?? '', min_rank: posDef?.min_rank ?? a.min_rank ?? '' };
      });
      const submittedAt = new Date().toISOString();
      // 1.1b consolidation: run_lists is DERIVED server-side from THIS shift's
      // apparatus_assignments — we no longer post a client-authored crew[]. The
      // local `crew` (built from the same assignments) is used only for the
      // zero-lag broadcast below; it matches what the server derives.
      // Per-station grain (0072): scope the publish to the picked house when the
      // department runs more than one (multi-house depts require station_id; a
      // single-house dept omits it and the server resolves its one station).
      await api.post('/api/run-list', { date, shift_id: selectedShift.id, ...(selectedStation ? { station_id: selectedStation } : {}) });
      // Push the saved crew directly in the broadcast so The Board can update
      // its state immediately — no API round-trip, zero lag.
      try {
        const bc = new BroadcastChannel('openfirehouse');
        bc.postMessage({ type: 'run-list-saved', date, crew, submitted_at: submittedAt });
        bc.close();
      } catch (_) { /* BroadcastChannel not supported — silent fallback */ }
      setSaveState('saved');
      // Navigate to The Board after a short delay so the user sees the ✓ confirmation,
      // then EventCalendar mounts fresh and loadRunList fetches the newly-saved snapshot.
      setTimeout(() => {
        setSaveState('idle');
        if (onNavigate) onNavigate('calendar');
      }, 1500);
    } catch (err) {
      console.error('Failed to save run list:', err);
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 3000);
    }
  }

  async function handleRemove(assignmentId) {
    try {
      await api.delete(`/api/apparatus-assignments/${assignmentId}`);
      setAssignments(prev => prev.filter(a => a.id !== assignmentId));
    } catch (err) {
      alert(err.message || 'Failed to remove');
    }
  }

  const fmtDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-600 dark:text-gray-400">
        <Loader2 className="h-8 w-8 animate-spin mr-3" />
        <span className="text-sm">Loading assignment board…</span>
      </div>
    );
  }

  // Build shift crew lookup — used for sorting dropdowns, not filtering them.
  // Career depts: shiftCrew may be empty; full roster is always available.
  // Volunteer depts: shiftCrew is populated from the duty schedule and floats
  // those members to the top of every dropdown as a convenience.
  const shiftCrew = selectedShift?.crew
    ? (typeof selectedShift.crew === 'string' ? JSON.parse(selectedShift.crew) : selectedShift.crew)
    : [];
  const shiftCrewIds = new Set(members.filter(m => shiftCrew.includes(m.name)).map(m => m.id));
  const scheduledCount = shiftCrewIds.size;

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Truck className="h-6 w-6 text-red-700 dark:text-red-300" />
            Daily Apparatus Assignment Board
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Assign crew members to apparatus positions for each shift</p>
        </div>

        {/* Save to Board button */}
        {canEdit && selectedShift && assignments.length > 0 && (
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={saveToBoard}
              disabled={saveState === 'saving'}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm shadow transition-all ${
                saveState === 'saved'
                  ? 'bg-green-600 text-white'
                  : (saveState === 'error' || saveState === 'needs-station')
                  ? 'bg-red-600 text-white'
                  : 'bg-red-700 hover:bg-red-800 text-white'
              }`}
            >
              {saveState === 'saving' ? (
                <><Loader2 size={15} className="animate-spin" /> Saving…</>
              ) : saveState === 'saved' ? (
                <><CheckCircle size={15} /> Saved to Board</>
              ) : saveState === 'needs-station' ? (
                <>Pick a station first</>
              ) : saveState === 'error' ? (
                <>Error — try again</>
              ) : (
                <><Save size={15} /> Save to Board</>
              )}
            </button>
            {(needsStation || saveState === 'needs-station') && (
              <p className="text-[11px] text-red-600 dark:text-red-400 font-semibold">
                Choose a station in the top bar — a roster belongs to one house.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Date navigator */}
      <div className="flex items-center gap-4">
        <button onClick={() => changeDate(-1)} aria-label="Previous day" className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-red-700 dark:text-red-300" />
          <input type="date" value={date} onChange={e => setDate(e.target.value)} aria-label="Assignment date"
            className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm font-semibold dark:bg-gray-900 dark:text-gray-100" />
          <span className="text-sm text-gray-500 dark:text-gray-400">{fmtDate}</span>
        </div>
        <button onClick={() => changeDate(1)} aria-label="Next day" className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
          <ChevronRight size={16} />
        </button>
        <button onClick={() => setDate(new Date().toISOString().slice(0, 10))}
          className="px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
          Today
        </button>
      </div>

      {/* Shift selector */}
      {shifts.length > 0 ? (
        <div className="flex gap-2">
          {shifts.map(s => {
            const crew = typeof s.crew === 'string' ? JSON.parse(s.crew) : (s.crew || []);
            return (
              <button key={s.id} onClick={() => setSelectedShift(s)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                  selectedShift?.id === s.id
                    ? 'bg-red-700 text-white border-red-700'
                    : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-red-400'
                }`}>
                {s.shiftType} · {crew.length} crew
              </button>
            );
          })}
        </div>
      ) : (
        <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3 flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-700 dark:text-amber-400" />
          <p className="text-sm text-amber-700 dark:text-amber-300">No shifts scheduled for this date. Create a shift first.</p>
        </div>
      )}

      {/* Assignment board */}
      {selectedShift && (
        <>
          <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
            <span className="font-semibold">{selectedShift.shiftType} Shift</span>
            <span>·</span>
            {scheduledCount > 0
              ? <span>{scheduledCount} scheduled · {members.length} total available</span>
              : <span>{members.length} members available</span>
            }
            <span>·</span>
            <span>{assignments.length} assigned to apparatus</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {apparatus.map(a => {
              const appPositions = positions.filter(p => p.apparatus_id === a.id);
              const appAssignments = assignments.filter(asgn => asgn.apparatus_id === a.id);
              return (
                <ApparatusCard
                  key={a.id}
                  apparatus={a}
                  positions={appPositions}
                  assignments={appAssignments}
                  staffing={staffing}
                  availableMembers={members}
                  shiftCrewIds={shiftCrewIds}
                  onAssign={(pos, mid) => handleAssign({ ...pos, apparatus_id: a.id }, mid)}
                  onRemove={handleRemove}
                  canEdit={canEdit}
                />
              );
            })}
          </div>

          {apparatus.length === 0 && (
            <div className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl px-5 py-8 text-center">
              <Truck className="mx-auto h-8 w-8 text-gray-200 mb-2" />
              <p className="text-sm text-gray-600 dark:text-gray-400">No apparatus in service</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Add apparatus in the Apparatus Tracker module</p>
            </div>
          )}
        </>
      )}

      {/* Setup tip */}
      <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-xl px-4 py-3">
        <Settings size={14} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
          <strong>Setup:</strong> Define apparatus positions (Officer, Driver/Operator, Firefighter, etc.) in the Apparatus Tracker.
          Each apparatus can have multiple position slots with required certifications.
          Then use this board daily to assign on-shift crew to specific apparatus positions.
        </p>
      </div>
    </div>
  );
}
