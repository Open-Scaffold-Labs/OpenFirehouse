import React, { useState, useEffect } from 'react';
import { Users, Check, X } from 'lucide-react';
import { api, getStoredUser } from '../utils/api';

export default function AvailabilityWidget({ compact = false }) {
  const [members, setMembers] = useState([]);
  const [currentUserStatus, setCurrentUserStatus] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toggling, setToggling] = useState(false);

  const currentUser = getStoredUser();

  // Fetch availability data
  const fetchAvailability = async () => {
    try {
      const response = await api.get('/api/availability');
      setMembers(Array.isArray(response.data) ? response.data : Array.isArray(response) ? response : []);

      // Find current user's status
      if (currentUser && response.data) {
        const user = response.data.find(m => m.user_id === currentUser.id);
        if (user) {
          setCurrentUserStatus(user.available);
        }
      }

      setError(null);
    } catch (err) {
      console.error('Error fetching availability:', err);
      setError('Failed to load availability');
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchAvailability();
  }, []);

  // Poll every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAvailability();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // Toggle current user's availability
  const handleToggle = async () => {
    if (!currentUser || toggling) return;

    setToggling(true);
    try {
      await api.post('/api/availability/toggle', {
        available: !currentUserStatus,
      });
      setCurrentUserStatus(!currentUserStatus);
    } catch (err) {
      console.error('Error toggling availability:', err);
      setError('Failed to update status');
    } finally {
      setToggling(false);
    }
  };

  // Calculate availability counts
  const availableCount = members.filter(m => m.available).length;
  const totalCount = members.length;

  // Format relative time
  const formatRelativeTime = (timestamp) => {
    if (!timestamp) return 'just now';

    const now = new Date();
    const updated = new Date(timestamp);
    const diffMs = now - updated;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  // Sort members: available first, then alphabetically
  const sortedMembers = [...members].sort((a, b) => {
    if (a.available !== b.available) {
      return b.available - a.available;
    }
    return a.member_name.localeCompare(b.member_name);
  });

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={handleToggle}
          disabled={toggling || !currentUser}
          className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
            currentUserStatus
              ? 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
          } disabled:opacity-50`}
        >
          {currentUserStatus ? 'Available' : 'Unavailable'}
        </button>
        <div className="text-sm text-gray-600 dark:text-gray-300 font-medium">
          {availableCount} / {totalCount}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 w-full max-w-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Who's Available</h2>
        </div>
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300">
          {availableCount} / {totalCount}
        </span>
      </div>

      {/* Current User Toggle */}
      {currentUser && (
        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">My Status</span>
            <button
              onClick={handleToggle}
              disabled={toggling}
              className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                currentUserStatus
                  ? 'bg-green-500 text-white hover:bg-green-600'
                  : 'bg-gray-400 text-white hover:bg-gray-500'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {currentUserStatus ? (
                <>
                  <Check className="w-4 h-4" />
                  Available
                </>
              ) : (
                <>
                  <X className="w-4 h-4" />
                  Unavailable
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="text-center py-6">
          <div className="inline-block animate-spin">
            <Users className="w-5 h-5 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Loading...</p>
        </div>
      )}

      {/* Members List */}
      {!loading && (
        <div className="space-y-2">
          {sortedMembers.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No members</p>
          ) : (
            sortedMembers.map((member) => (
              <div
                key={member.user_id}
                className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      member.available ? 'bg-green-500' : 'bg-gray-400'
                    }`}
                  />
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {member.member_name}
                  </span>
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 ml-2 flex-shrink-0">
                  {formatRelativeTime(member.updated_at)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
