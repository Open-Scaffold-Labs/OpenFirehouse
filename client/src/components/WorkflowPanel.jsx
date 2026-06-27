/**
 * WorkflowPanel — AI Workflow Orchestration UI
 *
 * Accessed from the main nav. Shows active workflow tasks, completeness
 * checklists, and AI chat per task.
 *
 * DOCTRINE (Matt, 2026-06-10): the old Drafts tab (AI-generated incident
 * narratives) was removed entirely. AI plays zero role in incident
 * narratives — the officer writes them directly. Do not reintroduce.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Brain, CheckCircle2, Circle, AlertTriangle, MessageSquare,
  Plus, Trash2, RefreshCw, ChevronDown, ChevronRight,
  Send, X, Clock, Loader2
} from 'lucide-react';
import { api } from '../utils/api';
import AIActionButton from './AIActionButton';

// ── Status badge colors ──────────────────────────────────────────────────────
const STATUS_CONFIG = {
  complete: { icon: CheckCircle2, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-950/50', label: 'Complete' },
  partial:  { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/50', label: 'Partial' },
  missing:  { icon: Circle,        color: 'text-red-400',   bg: 'bg-red-50 dark:bg-red-950/50',   label: 'Missing' },
  optional: { icon: Circle,        color: 'text-gray-300 dark:text-gray-600',  bg: 'bg-gray-50 dark:bg-gray-950',  label: 'Optional' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.missing;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
      <Icon size={12} /> {cfg.label}
    </span>
  );
}

// ── Progress ring ────────────────────────────────────────────────────────────
function ProgressRing({ percentage }) {
  const r = 28, c = 2 * Math.PI * r, offset = c - (percentage / 100) * c;
  const color = percentage === 100 ? '#16a34a' : percentage >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative w-20 h-20 flex-shrink-0">
      <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#e5e7eb" strokeWidth="4" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="4"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold text-gray-800 dark:text-gray-100">{percentage}%</span>
      </div>
    </div>
  );
}

// ── Create Task Modal ────────────────────────────────────────────────────────
function CreateTaskModal({ onClose, onCreate }) {
  const [incidents, setIncidents] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/incidents').then(r => {
      setIncidents(r.data || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleCreate = () => {
    if (!selectedId) return;
    const inc = incidents.find(i => i.id === parseInt(selectedId));
    onCreate({
      title: `Complete report: ${inc?.incidentNumber || selectedId}`,
      task_type: 'incident_report',
      target_module: 'incidents',
      target_record_id: parseInt(selectedId),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">New Workflow Task</h3>
          <button onClick={onClose} aria-label="Close" className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><X size={18} /></button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Select an incident to run the completeness engine against.</p>
        {loading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-gray-400">
            <Loader2 size={18} className="animate-spin" /> Loading incidents...
          </div>
        ) : (
          <select value={selectedId} onChange={e => setSelectedId(e.target.value)} aria-label="Select incident"
            className="w-full border rounded-lg px-3 py-2 text-sm mb-4 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700">
            <option value="">Select an incident...</option>
            {incidents.slice(0, 50).map(inc => (
              <option key={inc.id} value={inc.id}>
                {inc.incidentNumber} — {inc.type} — {inc.date} — {inc.address}
              </option>
            ))}
          </select>
        )}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancel</button>
          <button onClick={handleCreate} disabled={!selectedId}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
            <Plus size={14} className="inline mr-1" /> Create Task
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Task Detail View ─────────────────────────────────────────────────────────
function TaskDetail({ task, onBack, onRefresh }) {
  const [activeTab, setActiveTab] = useState('checklist');
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [localTask, setLocalTask] = useState(task);
  const chatEndRef = useRef(null);

  useEffect(() => { setLocalTask(task); }, [task]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [localTask.conversation]);

  const checklist = localTask.checklist || [];
  const conversation = localTask.conversation || [];
  const complete = checklist.filter(c => c.status === 'complete').length;
  const total = checklist.filter(c => c.status !== 'optional').length;
  const pct = total > 0 ? Math.round((complete / total) * 100) : 0;

  const sendMessage = async () => {
    if (!chatInput.trim() || sending) return;
    const msg = chatInput.trim();
    setChatInput('');
    setSending(true);

    // Optimistic add
    setLocalTask(t => ({
      ...t, conversation: [...(t.conversation || []), { role: 'user', content: msg, timestamp: new Date().toISOString() }],
    }));

    try {
      const res = await api.post(`/api/workflows/${localTask.id}/chat`, { message: msg });
      setLocalTask(res.data);
    } catch (err) {
      setLocalTask(t => ({
        ...t, conversation: [...(t.conversation || []), { role: 'assistant', content: `Error: ${err.message}`, timestamp: new Date().toISOString() }],
      }));
    }
    setSending(false);
  };

  const handleRefresh = async () => {
    try {
      const res = await api.get(`/api/workflows/${localTask.id}`);
      setLocalTask(res.data);
      onRefresh?.();
    } catch {}
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={onBack} aria-label="Back to task list" className="mt-1 p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
          <ChevronRight size={18} className="rotate-180" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">{localTask.title}</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Created {new Date(localTask.created_at).toLocaleDateString()} &middot; {localTask.task_type.replace(/_/g, ' ')}
          </p>
        </div>
        <ProgressRing percentage={pct} />
      </div>

      {/* Tabs — no Drafts tab: AI never writes incident narratives (doctrine 2026-06-10) */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        {[
          { id: 'checklist', label: 'Checklist', icon: CheckCircle2 },
          { id: 'chat', label: 'AI Agent', icon: MessageSquare },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === tab.id ? 'bg-white dark:bg-gray-900 shadow text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>
            <tab.icon size={14} /> {tab.label}
          </button>
        ))}
      </div>

      {/* Checklist Tab */}
      {activeTab === 'checklist' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400">{complete} of {total} required items complete</span>
            <button onClick={handleRefresh} className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 flex items-center gap-1">
              <RefreshCw size={12} /> Recheck
            </button>
          </div>
          {checklist.map((item, i) => (
            <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${
              item.status === 'complete' ? 'bg-green-50 dark:bg-green-950/50 border-green-100 dark:border-green-900' :
              item.status === 'partial' ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-100 dark:border-amber-900' :
              item.status === 'optional' ? 'bg-gray-50 dark:bg-gray-950 border-gray-100 dark:border-gray-700' :
              'bg-red-50 dark:bg-red-950/50 border-red-100 dark:border-red-900'
            }`}>
              <StatusBadge status={item.status} />
              <div className="flex-1 min-w-0">
                <span className="text-sm text-gray-800 dark:text-gray-100">{item.label}</span>
                {item.data?.value && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{item.data.value}</p>
                )}
                {item.data?.detail && item.status !== 'complete' && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.data.detail}</p>
                )}
              </div>
              {item.data?.aiAction && item.status !== 'complete' && localTask.target_record_id && (
                <AIActionButton
                  action={item.data.aiAction}
                  context={{ module: 'incidents', recordId: localTask.target_record_id }}
                  label="AI: Fix"
                  variant="inline"
                  saveable
                  onApplied={handleRefresh}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Chat Tab */}
      {activeTab === 'chat' && (
        <div className="flex flex-col" style={{ height: '400px' }}>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {conversation.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-bl-sm'
                }`}>
                  {msg.content}
                  <div className={`text-[10px] mt-1 ${msg.role === 'user' ? 'text-blue-200' : 'text-gray-400'}`}>
                    {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </div>
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-2 text-sm text-gray-400 flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> Thinking...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="mt-3 flex gap-2">
            <input type="text" value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Ask about this task..."
              aria-label="Ask about this task"
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" />
            <button onClick={sendMessage} disabled={sending || !chatInput.trim()}
              aria-label="Send message"
              className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
              <Send size={16} />
            </button>
          </div>
          {/* Quick prompts */}
          <div className="mt-2 flex gap-2 flex-wrap">
            {['What\'s still missing?', 'Summarize progress'].map(q => (
              <button key={q} onClick={() => { setChatInput(q); }}
                className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full">
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function WorkflowPanel() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [expanded, setExpanded] = useState({});

  const loadTasks = useCallback(async () => {
    try {
      const res = await api.get('/api/workflows');
      setTasks(res.data || []);
    } catch (err) {
      console.error('Failed to load workflow tasks:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const handleCreate = async (data) => {
    try {
      const res = await api.post('/api/workflows', data);
      setTasks(t => [res.data, ...t]);
      setShowCreate(false);
      setSelectedTask(res.data);
    } catch (err) {
      alert('Failed to create task: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this workflow task?')) return;
    try {
      await api.delete(`/api/workflows/${id}`);
      setTasks(t => t.filter(x => x.id !== id));
      if (selectedTask?.id === id) setSelectedTask(null);
    } catch {}
  };

  const selectTask = async (task) => {
    try {
      const res = await api.get(`/api/workflows/${task.id}`);
      setSelectedTask(res.data);
    } catch {
      setSelectedTask(task);
    }
  };

  // ── Selected task detail view ──────────────────────────────────────────────
  if (selectedTask) {
    return (
      <div className="max-w-3xl mx-auto">
        <TaskDetail
          task={selectedTask}
          onBack={() => { setSelectedTask(null); loadTasks(); }}
          onRefresh={loadTasks}
        />
      </div>
    );
  }

  // ── Task list view ─────────────────────────────────────────────────────────
  const activeTasks = tasks.filter(t => t.status === 'active');
  const completedTasks = tasks.filter(t => t.status !== 'active');

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-100 dark:bg-indigo-950/50 rounded-xl">
            <Brain size={22} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">AI Workflow Orchestration</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Your AI manages multi-step tasks to completion</p>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 flex items-center gap-2">
          <Plus size={16} /> New Task
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 size={24} className="animate-spin mr-2" /> Loading workflows...
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 dark:bg-gray-950 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
          <Brain size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <h3 className="text-lg font-semibold text-gray-600 dark:text-gray-300 mb-2">No workflow tasks yet</h3>
          <p className="text-sm text-gray-400 max-w-md mx-auto mb-6">
            Create a workflow task to have the AI check completeness and track
            progress on incident reports and other multi-step documents.
          </p>
          <button onClick={() => setShowCreate(true)}
            className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 inline-flex items-center gap-2">
            <Plus size={16} /> Create Your First Task
          </button>
        </div>
      ) : (
        <>
          {/* Active Tasks */}
          {activeTasks.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Active Tasks</h2>
              {activeTasks.map(task => {
                const cl = task.checklist || [];
                const done = cl.filter(c => c.status === 'complete').length;
                const tot = cl.filter(c => c.status !== 'optional').length;
                const pct = tot > 0 ? Math.round((done / tot) * 100) : 0;
                return (
                  <div key={task.id}
                    className="bg-white dark:bg-gray-900 border rounded-xl p-4 hover:shadow-md transition-shadow cursor-pointer"
                    role="button" tabIndex={0} aria-label={`Open task ${task.title}`}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectTask(task); } }}
                    onClick={() => selectTask(task)}>
                    <div className="flex items-center gap-4">
                      <ProgressRing percentage={pct} />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">{task.title}</h3>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {task.task_type.replace(/_/g, ' ')} &middot; {done}/{tot} items &middot;
                          Updated {new Date(task.updated_at).toLocaleDateString()}
                        </p>
                        {/* Mini status bar */}
                        <div className="mt-2 flex gap-1">
                          {cl.filter(c => c.status !== 'optional').map((item, i) => (
                            <div key={i} title={item.label}
                              className={`h-1.5 flex-1 rounded-full ${
                                item.status === 'complete' ? 'bg-green-400' :
                                item.status === 'partial' ? 'bg-amber-400' : 'bg-red-300'
                              }`} />
                          ))}
                        </div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); handleDelete(task.id); }}
                        aria-label="Delete task"
                        className="p-2 text-gray-300 dark:text-gray-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Completed Tasks */}
          {completedTasks.length > 0 && (
            <div className="space-y-3">
              <button onClick={() => setExpanded(e => ({ ...e, done: !e.done }))}
                className="flex items-center gap-2 text-sm font-bold text-gray-400 uppercase tracking-wider">
                {expanded.done ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Completed ({completedTasks.length})
              </button>
              {expanded.done && completedTasks.map(task => (
                <div key={task.id}
                  className="bg-gray-50 dark:bg-gray-950 border rounded-xl p-4 opacity-60 cursor-pointer hover:opacity-80"
                  role="button" tabIndex={0} aria-label={`Open completed task ${task.title}`}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectTask(task); } }}
                  onClick={() => selectTask(task)}>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 size={20} className="text-green-500" />
                    <span className="text-sm text-gray-600 dark:text-gray-300 flex-1 truncate">{task.title}</span>
                    <button onClick={e => { e.stopPropagation(); handleDelete(task.id); }}
                      aria-label="Delete task"
                      className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-400"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {showCreate && <CreateTaskModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
    </div>
  );
}
