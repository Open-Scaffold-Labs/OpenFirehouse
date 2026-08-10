import { useState, useRef, useEffect } from 'react';
import { X, Play } from 'lucide-react';
import useDialog from '../hooks/useDialog';

function parseIncidentNotes(notes) {
  if (!notes) return { milestones: [], apparatus: [], personnel: [], parHistory: [], commsLog: [] };

  const lines = notes.split('\n');
  const sections = {
    milestones: [],
    apparatus: [],
    personnel: [],
    parHistory: [],
    commsLog: [],
  };

  let currentSection = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect section headers
    if (trimmed === '--- MILESTONES ---') {
      currentSection = 'milestones';
      continue;
    } else if (trimmed === '--- APPARATUS ---') {
      currentSection = 'apparatus';
      continue;
    } else if (trimmed === '--- PERSONNEL ---') {
      currentSection = 'personnel';
      continue;
    } else if (trimmed === '--- PAR HISTORY ---') {
      currentSection = 'parHistory';
      continue;
    } else if (trimmed === '--- COMMS LOG ---' || trimmed === '--- RADIO / COMMS LOG ---') {
      currentSection = 'commsLog';
      continue;
    }

    // Skip empty lines and other headers
    if (!trimmed || trimmed.startsWith('---')) continue;

    // Add line to current section if we're in one
    if (currentSection && sections[currentSection] !== undefined) {
      sections[currentSection].push(trimmed);
    }
  }

  return sections;
}

function extractTimeFromLine(line) {
  // Look for HH:MM or HH:MM:SS at the start of a line
  const match = line.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;

  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const s = match[3] ? parseInt(match[3], 10) : 0;

  // Convert to minutes since midnight for sorting
  return h * 60 + m + s / 60;
}

function createTimelineEvents(incident) {
  const parsed = parseIncidentNotes(incident.notes || '');
  const events = [];

  // Extract header info
  let incidentType = '';
  let address = '';
  let date = '';

  if (incident.notes) {
    const firstLine = incident.notes.split('\n')[0];
    const typeMatch = firstLine.match(/\[(.*?)\]/);
    const addressMatch = firstLine.match(/@\s*(.+?)(?:\s*\[|$)/);
    if (typeMatch) incidentType = typeMatch[1];
    if (addressMatch) address = addressMatch[1];
  }

  date = incident.date || new Date().toLocaleDateString();

  // Milestones
  parsed.milestones.forEach((line) => {
    const timeMin = extractTimeFromLine(line);
    const timeStr = line.split(/[—–]/).shift()?.trim() || '';
    const desc = line.split(/[—–]/).slice(1).join('—').trim() || line;

    events.push({
      time: timeMin ?? 999999,
      timeStr,
      type: 'milestone',
      description: desc,
      icon: '🚨',
      dotColor: 'bg-red-500',
    });
  });

  // Apparatus
  parsed.apparatus.forEach((line) => {
    events.push({
      time: 999999,
      timeStr: '',
      type: 'apparatus',
      description: line,
      icon: '🚒',
      dotColor: 'bg-blue-500',
    });
  });

  // Personnel
  parsed.personnel.forEach((line) => {
    events.push({
      time: 999999,
      timeStr: '',
      type: 'personnel',
      description: line,
      icon: '👤',
      dotColor: 'bg-green-500',
    });
  });

  // PAR History
  parsed.parHistory.forEach((line) => {
    const timeMin = extractTimeFromLine(line);
    const timeStr = line.split(/[—–]/).shift()?.trim() || '';
    const desc = line.split(/[—–]/).slice(1).join('—').trim() || line;

    events.push({
      time: timeMin ?? 999999,
      timeStr,
      type: 'par',
      description: desc,
      icon: '✓',
      dotColor: 'bg-orange-500',
    });
  });

  // Comms Log
  parsed.commsLog.forEach((line) => {
    const timeMin = extractTimeFromLine(line);
    const timeStr = line.split(/[\[\]]/).shift()?.trim() || '';
    const desc = line.split(/[\[\]]/).slice(1).join('').trim() || line;

    events.push({
      time: timeMin ?? 999999,
      timeStr,
      type: 'comms',
      description: desc,
      icon: '📻',
      dotColor: 'bg-purple-500',
    });
  });

  // Sort chronologically (events with time first, then others)
  events.sort((a, b) => a.time - b.time);

  return {
    incidentType,
    address,
    date,
    events,
  };
}

export default function IncidentTimeline({ incident, onClose }) {
  // Dialog semantics + focus management (see hooks/useDialog.js). NO Escape-to-close.
  const dlg = useDialog();

  const [isReplaying, setIsReplaying] = useState(false);
  const [visibleCount, setVisibleCount] = useState(Infinity);
  const replayTimerRef = useRef(null);
  // Clear the replay interval if the component unmounts mid-replay, so it never
  // ticks setState on an unmounted component.
  useEffect(() => () => { if (replayTimerRef.current) clearInterval(replayTimerRef.current); }, []);

  if (!incident) return null;

  const timeline = createTimelineEvents(incident);

  function handleReplay() {
    // Guard against a second click starting a parallel interval.
    if (replayTimerRef.current) clearInterval(replayTimerRef.current);
    setIsReplaying(true);
    setVisibleCount(0);

    let count = 0;
    replayTimerRef.current = setInterval(() => {
      count++;
      setVisibleCount(count);

      if (count >= timeline.events.length) {
        clearInterval(replayTimerRef.current);
        replayTimerRef.current = null;
        setIsReplaying(false);
      }

      // Smooth scroll to latest event
      setTimeout(() => {
        const latest = document.querySelector('[data-timeline-latest]');
        if (latest) {
          latest.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 50);
    }, 400);
  }

  const displayedEvents = timeline.events.slice(0, visibleCount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div {...dlg.dialogProps} className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex-1">
            <h2 id={dlg.titleId} className="text-xl font-bold text-gray-900 dark:text-gray-100">Incident Timeline</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {timeline.incidentType} · {timeline.address} · {timeline.date}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close timeline"
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Replay button */}
        <div className="px-6 py-3 bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
            {timeline.events.length} Events
          </p>
          <button
            onClick={handleReplay}
            disabled={isReplaying}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-600 dark:disabled:bg-gray-700 dark:disabled:text-gray-300 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <Play size={14} />
            {isReplaying ? 'Playing...' : 'Replay'}
          </button>
        </div>

        {/* Timeline content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {timeline.events.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-center">
              <div>
                <p className="text-gray-500 dark:text-gray-400 text-sm">No timeline data available</p>
                <p className="text-gray-400 text-xs mt-1">Incident notes may not contain timeline information</p>
              </div>
            </div>
          ) : (
            <div className="relative">
              {/* Vertical timeline line */}
              <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gradient-to-b from-red-300 via-orange-300 to-purple-300" />

              {/* Events */}
              <div className="space-y-6 relative z-10">
                {displayedEvents.map((event, idx) => (
                  <div key={idx} data-timeline-latest={idx === displayedEvents.length - 1 ? true : undefined}>
                    <div className="flex gap-4 items-start">
                      {/* Dot */}
                      <div className={`flex-shrink-0 w-7 h-7 rounded-full ${event.dotColor} shadow-md flex items-center justify-center text-sm font-bold`}>
                        {event.icon}
                      </div>

                      {/* Content */}
                      <div className="flex-1 pt-0.5">
                        {event.timeStr && (
                          <div className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                            {event.timeStr}
                          </div>
                        )}
                        <p className="text-sm text-gray-900 dark:text-gray-100 mt-1 leading-snug">
                          {event.description}
                        </p>
                        <div className="text-xs text-gray-400 mt-1.5">
                          {event.type === 'milestone' && 'Milestone'}
                          {event.type === 'apparatus' && 'Apparatus'}
                          {event.type === 'personnel' && 'Personnel'}
                          {event.type === 'par' && 'Personnel Accountability'}
                          {event.type === 'comms' && 'Communications'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
