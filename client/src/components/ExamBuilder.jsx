import { useState } from 'react';
import { X, Plus, Trash2, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';

const EXAM_CATEGORIES = [
  'General',
  'Fire Operations',
  'EMS',
  'HazMat',
  'Technical Rescue',
  'Leadership',
  'Safety',
];

export default function ExamBuilder({ exam, members, onSave, onCancel }) {
  // Form state
  const [title, setTitle] = useState(exam?.title || '');
  const [description, setDescription] = useState(exam?.description || '');
  const [category, setCategory] = useState(exam?.category || 'General');
  const [timeLimit, setTimeLimit] = useState(exam?.time_limit || 0);
  const [passingScore, setPassingScore] = useState(exam?.passing_score || 70);
  const [randomize, setRandomize] = useState(exam?.randomize ?? true);
  const [dueDate, setDueDate] = useState(exam?.due_date || '');
  const [status, setStatus] = useState(exam?.status || 'draft');
  const [questions, setQuestions] = useState(exam?.questions || []);
  const [expandedId, setExpandedId] = useState(null);
  const [selectedMembers, setSelectedMembers] = useState(new Set());

  // Editors for individual questions
  const [editors, setEditors] = useState({});

  function initEditor(qId) {
    if (!editors[qId]) {
      const q = questions.find(x => x.id === qId);
      setEditors({
        ...editors,
        [qId]: {
          text: q?.text || '',
          options: q?.options || ['', '', '', ''],
          correctAnswer: q?.correctAnswer ?? 0,
          explanation: q?.explanation || '',
          points: q?.points || 1,
        },
      });
    }
  }

  function generateId() {
    return `q${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  function addQuestion() {
    const newId = generateId();
    const newQ = {
      id: newId,
      text: '',
      type: 'multiple_choice',
      options: ['', '', '', ''],
      correctAnswer: 0,
      explanation: '',
      points: 1,
    };
    setQuestions([...questions, newQ]);
    initEditor(newId);
    setExpandedId(newId);
  }

  function updateQuestion(qId, field, value) {
    setEditors({
      ...editors,
      [qId]: { ...editors[qId], [field]: value },
    });
  }

  function updateOption(qId, idx, value) {
    const opts = [...editors[qId].options];
    opts[idx] = value;
    updateQuestion(qId, 'options', opts);
  }

  function saveQuestion(qId) {
    const ed = editors[qId];
    if (!ed.text.trim()) {
      alert('Question text cannot be empty');
      return;
    }
    if (ed.options.some(o => !o.trim())) {
      alert('All options must be filled');
      return;
    }

    setQuestions(
      questions.map(q =>
        q.id === qId
          ? {
              ...q,
              text: ed.text,
              options: ed.options,
              correctAnswer: ed.correctAnswer,
              explanation: ed.explanation,
              points: ed.points,
            }
          : q
      )
    );
    setExpandedId(null);
  }

  function deleteQuestion(qId) {
    if (confirm('Delete this question?')) {
      setQuestions(questions.filter(q => q.id !== qId));
      const newEditors = { ...editors };
      delete newEditors[qId];
      setEditors(newEditors);
    }
  }

  function moveQuestion(idx, dir) {
    const newQuestions = [...questions];
    const swap = idx + dir;
    if (swap >= 0 && swap < newQuestions.length) {
      [newQuestions[idx], newQuestions[swap]] = [newQuestions[swap], newQuestions[idx]];
      setQuestions(newQuestions);
    }
  }

  function duplicateQuestion(qId) {
    const q = questions.find(x => x.id === qId);
    if (!q) return;
    const newId = generateId();
    const dup = { ...q, id: newId };
    setQuestions([...questions, dup]);
  }

  function toggleMember(memberId) {
    const updated = new Set(selectedMembers);
    if (updated.has(memberId)) {
      updated.delete(memberId);
    } else {
      updated.add(memberId);
    }
    setSelectedMembers(updated);
  }

  function selectAllMembers() {
    setSelectedMembers(new Set(members.map(m => m.id)));
  }

  function deselectAllMembers() {
    setSelectedMembers(new Set());
  }

  function handleSave() {
    if (!title.trim()) {
      alert('Exam title is required');
      return;
    }
    if (questions.length === 0) {
      alert('Add at least one question');
      return;
    }

    const examData = {
      title,
      description,
      category,
      time_limit: parseInt(timeLimit) || 0,
      passing_score: parseInt(passingScore) || 70,
      randomize,
      status,
      due_date: dueDate || null,
      questions,
      assigned_to: Array.from(selectedMembers),
    };

    onSave(examData);
  }

  return (
    <div className="fixed inset-0 sm:left-56 z-40 bg-black/50 flex items-start justify-center overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl m-4 w-full max-w-4xl">
        {/* Header */}
        <div className="bg-red-700 text-white px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold">{exam ? 'Edit Exam' : 'Create Exam'}</h2>
          <button
            onClick={onCancel}
            aria-label="Close exam builder"
            className="p-1 hover:bg-red-600 rounded transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
          <div className="px-6 py-6 space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Exam Details</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Exam Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g., Fire Safety Certification 2026"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Exam purpose and instructions..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
                  >
                    {EXAM_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
                  />
                </div>
              </div>
            </div>

            {/* Settings */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Settings</h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Time Limit (minutes)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={timeLimit}
                    onChange={e => setTimeLimit(e.target.value)}
                    placeholder="0 for unlimited"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Passing Score (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={passingScore}
                    onChange={e => setPassingScore(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
                  />
                </div>

                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={randomize}
                      onChange={e => setRandomize(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 dark:border-gray-700 text-red-600 dark:text-red-400 focus:ring-red-600"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Randomize Questions</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Status
                </label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </div>
            </div>

            {/* Questions */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Questions ({questions.length})
                </h3>
                <button
                  onClick={addQuestion}
                  className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                >
                  <Plus size={16} /> Add Question
                </button>
              </div>

              <div className="space-y-3">
                {questions.map((q, idx) => (
                  <div key={q.id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    {/* Question Summary */}
                    <div
                      onClick={() => {
                        if (expandedId === q.id) {
                          setExpandedId(null);
                        } else {
                          initEditor(q.id);
                          setExpandedId(q.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`Toggle question ${idx + 1} editor`}
                      aria-expanded={expandedId === q.id}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (expandedId === q.id) { setExpandedId(null); } else { initEditor(q.id); setExpandedId(q.id); } } }}
                      className="bg-gray-50 dark:bg-gray-950 px-4 py-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-start justify-between gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                            Q{idx + 1}
                          </span>
                          <span className="text-xs bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300 px-2 py-1 rounded">
                            {q.options[q.correctAnswer] || 'No answer set'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 truncate">
                          {q.text || 'Click to add question text'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {expandedId === q.id ? (
                          <ChevronUp size={20} className="text-gray-400" />
                        ) : (
                          <ChevronDown size={20} className="text-gray-400" />
                        )}
                      </div>
                    </div>

                    {/* Question Editor */}
                    {expandedId === q.id && (
                      <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-4 space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Question Text
                          </label>
                          <textarea
                            value={editors[q.id]?.text || ''}
                            onChange={e => updateQuestion(q.id, 'text', e.target.value)}
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Answer Options
                          </label>
                          <div className="space-y-2">
                            {[0, 1, 2, 3].map(i => (
                              <div key={i} className="flex items-center gap-3">
                                <input
                                  type="radio"
                                  name={`correct_${q.id}`}
                                  checked={editors[q.id]?.correctAnswer === i}
                                  onChange={() => updateQuestion(q.id, 'correctAnswer', i)}
                                  aria-label={`Mark option ${String.fromCharCode(65 + i)} as correct`}
                                  className="w-4 h-4 text-red-600 dark:text-red-400 border-gray-300 dark:border-gray-700 focus:ring-red-600"
                                />
                                <span className="text-sm font-medium text-gray-600 dark:text-gray-300 w-6">
                                  {String.fromCharCode(65 + i)}.
                                </span>
                                <input
                                  type="text"
                                  value={editors[q.id]?.options[i] || ''}
                                  onChange={e => updateOption(q.id, i, e.target.value)}
                                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 text-sm"
                                />
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Explanation
                          </label>
                          <textarea
                            value={editors[q.id]?.explanation || ''}
                            onChange={e => updateQuestion(q.id, 'explanation', e.target.value)}
                            placeholder="Why is the correct answer right?"
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
                          />
                        </div>

                        <div className="flex items-center justify-between pt-2">
                          <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Points:</label>
                            <input
                              type="number"
                              min="1"
                              value={editors[q.id]?.points || 1}
                              onChange={e =>
                                updateQuestion(q.id, 'points', Math.max(1, parseInt(e.target.value) || 1))
                              }
                              className="w-16 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-red-600 text-sm"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => saveQuestion(q.id)}
                              className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-sm"
                            >
                              <Check size={16} /> Save
                            </button>
                            <button
                              onClick={() => duplicateQuestion(q.id)}
                              className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                              title="Duplicate"
                              aria-label="Duplicate question"
                            >
                              <Copy size={16} />
                            </button>
                            <button
                              onClick={() => moveQuestion(idx, -1)}
                              disabled={idx === 0}
                              className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors disabled:opacity-50"
                              title="Move Up"
                              aria-label="Move question up"
                            >
                              <ChevronUp size={16} />
                            </button>
                            <button
                              onClick={() => moveQuestion(idx, 1)}
                              disabled={idx === questions.length - 1}
                              className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors disabled:opacity-50"
                              title="Move Down"
                              aria-label="Move question down"
                            >
                              <ChevronDown size={16} />
                            </button>
                            <button
                              onClick={() => deleteQuestion(q.id)}
                              className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded transition-colors"
                              title="Delete"
                              aria-label="Delete question"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {questions.length === 0 && (
                  <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
                    <p>No questions yet. Click "Add Question" to get started.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Member Assignment */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Assign to Members</h3>

              <div className="flex gap-2 mb-3">
                <button
                  onClick={selectAllMembers}
                  className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 transition-colors"
                >
                  Select All
                </button>
                <button
                  onClick={deselectAllMembers}
                  className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 transition-colors"
                >
                  Deselect All
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-950">
                {members.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No members available</p>
                ) : (
                  members.map(member => (
                    <label key={member.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedMembers.has(member.id)}
                        onChange={() => toggleMember(member.id)}
                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-700 text-red-600 dark:text-red-400 focus:ring-red-600"
                      />
                      <span className="text-sm text-gray-800 dark:text-gray-100">
                        {member.name}
                        {member.rank && <span className="text-gray-500 dark:text-gray-400 ml-1">({member.rank})</span>}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 px-6 py-4 flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              setStatus('draft');
              handleSave();
            }}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
          >
            Save as Draft
          </button>
          <button
            onClick={() => {
              setStatus('published');
              handleSave();
            }}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
          >
            Publish
          </button>
        </div>
      </div>
    </div>
  );
}
