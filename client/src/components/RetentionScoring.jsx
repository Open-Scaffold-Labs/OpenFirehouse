import { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, TrendingDown, Calendar, Clock, CheckCircle2 } from 'lucide-react';
import { api } from '../utils/api';
import AIActionButton from './AIActionButton';

export default function RetentionScoring() {
  const [members, setMembers] = useState([]);
  const [trainingRecords, setTrainingRecords] = useState([]);
  const [volunteerHours, setVolunteerHours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterTab, setFilterTab] = useState('all');
  const [sortBy, setSortBy] = useState('score-asc');

  // Fetch all required data
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        const [membersData, trainingData, hoursData] = await Promise.all([
          api.get('/api/members'),
          api.get('/api/training'),
          api.get('/api/volunteer-hours'),
        ]);

        setMembers(Array.isArray(membersData) ? membersData : membersData?.data ?? []);
        setTrainingRecords(Array.isArray(trainingData) ? trainingData : trainingData?.data ?? []);
        setVolunteerHours(Array.isArray(hoursData) ? hoursData : hoursData?.data ?? []);
      } catch (err) {
        console.error('RetentionScoring data fetch error:', err);
        setError(err.message || 'Failed to load retention data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  // Calculate engagement score for each member
  const scoredMembers = useMemo(() => {
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    return members
      .filter(m => m.status === 'Active')
      .map(member => {
        let score = 0;
        const memberId = member.id;

        // 1. Training activity (last 90 days): +30 if has recent completions
        const recentTraining = trainingRecords.filter(t => {
          const tMemberId = t.memberId === memberId || t.memberName === member.name;
          const tDate = new Date(t.completedDate || t.date);
          return tMemberId && t.status === 'Completed' && tDate >= ninetyDaysAgo;
        });
        if (recentTraining.length > 0) score += 30;

        // 2. Volunteer hours (last 90 days): +30 for 10+ hrs, +15 for 1-9 hrs
        const recentHours = volunteerHours.filter(h => {
          const hMemberId = h.memberId === memberId || h.memberName === member.name;
          const hDate = new Date(h.date);
          return hMemberId && hDate >= ninetyDaysAgo;
        });
        const totalRecentHours = recentHours.reduce((sum, h) => sum + (h.hours || 0), 0);
        if (totalRecentHours >= 10) {
          score += 30;
        } else if (totalRecentHours >= 1) {
          score += 15;
        }

        // 3. Tenure bonus: +10 for 1+ years, +20 for 3+ years
        const joinedDate = new Date(member.joined || member.joinedDate);
        const yearsOfTenure = (now - joinedDate) / (365.25 * 24 * 60 * 60 * 1000);
        if (yearsOfTenure >= 3) {
          score += 20;
        } else if (yearsOfTenure >= 1) {
          score += 10;
        }

        // 4. Probationary baseline: +20
        if (member.status === 'Probationary' || member.role === 'Probationary') {
          score += 20;
        }

        // Calculate days since last activity
        let lastActivityDate = null;
        const lastTraining = recentTraining
          .sort((a, b) => new Date(b.completedDate || b.date) - new Date(a.completedDate || a.date))
          .at(0);
        const lastHours = recentHours
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .at(0);

        if (lastTraining || lastHours) {
          const trainingDate = lastTraining ? new Date(lastTraining.completedDate || lastTraining.date) : null;
          const hoursDate = lastHours ? new Date(lastHours.date) : null;
          lastActivityDate = [trainingDate, hoursDate].filter(Boolean).sort((a, b) => b - a)[0];
        }

        const daysSinceLastActivity = lastActivityDate
          ? Math.floor((now - lastActivityDate) / (24 * 60 * 60 * 1000))
          : null;

        return {
          ...member,
          score: Math.min(score, 100),
          category: score >= 70 ? 'engaged' : score >= 40 ? 'watch' : 'at-risk',
          lastActivityDate,
          daysSinceLastActivity,
          lastTrainingDate: lastTraining ? new Date(lastTraining.completedDate || lastTraining.date) : null,
          lastHoursDate: lastHours ? new Date(lastHours.date) : null,
        };
      });
  }, [members, trainingRecords, volunteerHours]);

  // Apply filter
  const filteredMembers = useMemo(() => {
    let filtered = scoredMembers;
    if (filterTab === 'at-risk') {
      filtered = filtered.filter(m => m.category === 'at-risk');
    } else if (filterTab === 'watch') {
      filtered = filtered.filter(m => m.category === 'watch');
    } else if (filterTab === 'engaged') {
      filtered = filtered.filter(m => m.category === 'engaged');
    }
    return filtered;
  }, [scoredMembers, filterTab]);

  // Apply sort
  const sortedMembers = useMemo(() => {
    let sorted = [...filteredMembers];
    if (sortBy === 'score-asc') {
      sorted.sort((a, b) => a.score - b.score);
    } else if (sortBy === 'score-desc') {
      sorted.sort((a, b) => b.score - a.score);
    } else if (sortBy === 'inactive') {
      sorted.sort((a, b) => {
        const aDays = a.daysSinceLastActivity ?? 999999;
        const bDays = b.daysSinceLastActivity ?? 999999;
        return bDays - aDays;
      });
    }
    return sorted;
  }, [filteredMembers, sortBy]);

  // Summary stats
  const stats = useMemo(() => {
    return {
      total: scoredMembers.length,
      engaged: scoredMembers.filter(m => m.category === 'engaged').length,
      watch: scoredMembers.filter(m => m.category === 'watch').length,
      atRisk: scoredMembers.filter(m => m.category === 'at-risk').length,
    };
  }, [scoredMembers]);

  const atRiskMembers = scoredMembers.filter(m => m.category === 'at-risk').slice(0, 5);

  // Helper functions
  const getScoreBadgeColor = (category) => {
    switch (category) {
      case 'engaged':
        return 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300';
      case 'watch':
        return 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300';
      case 'at-risk':
        return 'bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300';
      default:
        return 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100';
    }
  };

  const getSuggestedAction = (member) => {
    if (!member.lastActivityDate) {
      return 'Reach out for orientation';
    }
    if (!member.lastTrainingDate) {
      return 'Invite to next training';
    }
    return 'Schedule check-in';
  };

  const formatDate = (date) => {
    if (!date) return 'Never';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500 dark:text-gray-400">Loading retention data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 p-4">
        <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* AI Retention Analysis */}
      <div className="flex gap-2">
        <AIActionButton
          action="retention_risk"
          context={{ module: 'retention' }}
          label="AI Retention Analysis"
          variant="button"
          resultType="json"
        />
      </div>

      {/* Summary Stats Bar */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="text-gray-600 dark:text-gray-300 text-sm font-medium">Total Active</div>
          <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">{stats.total}</div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="text-emerald-600 dark:text-emerald-400 text-sm font-medium">Engaged</div>
          <div className="text-3xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">{stats.engaged}</div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="text-amber-600 dark:text-amber-400 text-sm font-medium">Watch</div>
          <div className="text-3xl font-bold text-amber-700 dark:text-amber-300 mt-1">{stats.watch}</div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="text-red-600 dark:text-red-400 text-sm font-medium">At Risk</div>
          <div className="text-3xl font-bold text-red-700 dark:text-red-300 mt-1">{stats.atRisk}</div>
        </div>
      </div>

      {/* At Risk Section */}
      {atRiskMembers.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-red-200 dark:border-red-900 p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">At Risk Members</h2>
            <span className="text-sm text-red-600 dark:text-red-400 font-medium">({atRiskMembers.length})</span>
          </div>
          <div className="space-y-3">
            {atRiskMembers.map(member => (
              <div
                key={member.id}
                className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg p-4 flex items-start justify-between"
              >
                <div className="flex-1">
                  <div className="font-semibold text-gray-900 dark:text-gray-100">{member.name}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                    <div>Role: {member.role || 'Firefighter'}</div>
                    {member.lastActivityDate && (
                      <div className="text-amber-700 dark:text-amber-300 font-medium">
                        Last activity: {formatDate(member.lastActivityDate)} ({member.daysSinceLastActivity} days ago)
                      </div>
                    )}
                    {!member.lastActivityDate && (
                      <div className="text-red-700 dark:text-red-300 font-medium">No recent activity</div>
                    )}
                  </div>
                </div>
                <div className="text-right ml-4">
                  <div className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${getScoreBadgeColor(member.category)}`}>
                    {member.score}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-300 mt-2 bg-white dark:bg-gray-900 rounded px-2 py-1 border border-gray-200 dark:border-gray-700">
                    {getSuggestedAction(member)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full Roster Table */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Full Member Roster</h2>
          <div className="flex gap-4">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              aria-label="Sort members"
              className="text-sm border border-gray-300 dark:border-gray-700 rounded px-3 py-2 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="score-asc">Score: Low to High</option>
              <option value="score-desc">Score: High to Low</option>
              <option value="inactive">Most Inactive First</option>
            </select>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
          {['all', 'at-risk', 'watch', 'engaged'].map(tab => (
            <button
              key={tab}
              onClick={() => setFilterTab(tab)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                filterTab === tab
                  ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1).replace('-', ' ')}
              <span className="ml-2 text-gray-500 dark:text-gray-400">
                {tab === 'all'
                  ? `(${stats.total})`
                  : tab === 'at-risk'
                    ? `(${stats.atRisk})`
                    : tab === 'watch'
                      ? `(${stats.watch})`
                      : `(${stats.engaged})`}
              </span>
            </button>
          ))}
        </div>

        {/* Table */}
        {sortedMembers.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No members in this category.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left font-semibold text-gray-900 dark:text-gray-100 py-3 px-4">Name</th>
                  <th className="text-left font-semibold text-gray-900 dark:text-gray-100 py-3 px-4">Role</th>
                  <th className="text-center font-semibold text-gray-900 dark:text-gray-100 py-3 px-4">Score</th>
                  <th className="text-left font-semibold text-gray-900 dark:text-gray-100 py-3 px-4">Last Training</th>
                  <th className="text-left font-semibold text-gray-900 dark:text-gray-100 py-3 px-4">Last Hours Log</th>
                  <th className="text-center font-semibold text-gray-900 dark:text-gray-100 py-3 px-4">Days Inactive</th>
                  <th className="text-left font-semibold text-gray-900 dark:text-gray-100 py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedMembers.map(member => (
                  <tr key={member.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-medium text-gray-900 dark:text-gray-100">{member.name}</span>
                    </td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-300">{member.role || 'Firefighter'}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getScoreBadgeColor(member.category)}`}>
                        {member.score}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {member.lastTrainingDate ? (
                        <div className="flex items-center gap-1 text-gray-600 dark:text-gray-300">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          {formatDate(member.lastTrainingDate)}
                        </div>
                      ) : (
                        <span className="text-gray-400">None</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {member.lastHoursDate ? (
                        <div className="flex items-center gap-1 text-gray-600 dark:text-gray-300">
                          <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          {formatDate(member.lastHoursDate)}
                        </div>
                      ) : (
                        <span className="text-gray-400">None</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {member.daysSinceLastActivity !== null ? (
                        <span className={member.daysSinceLastActivity > 60 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-600 dark:text-gray-300'}>
                          {member.daysSinceLastActivity}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                            member.category === 'at-risk'
                              ? 'bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300 ring-red-600/20'
                              : member.category === 'watch'
                                ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 ring-amber-600/20'
                                : 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 ring-emerald-600/20'
                          }`}
                        >
                          {member.category === 'at-risk'
                            ? 'At Risk'
                            : member.category === 'watch'
                              ? 'Watch'
                              : 'Engaged'}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
