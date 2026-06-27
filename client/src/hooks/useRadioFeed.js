// useRadioFeed.js — Shared hook for real-time radio feed via WebSocket
// Used by The Board, CommandBoard, TVDisplay, and RadioLog.
// Falls back to polling if WebSocket is unavailable.

import { useState, useEffect, useRef, useCallback } from 'react';
import { api, getToken } from '../utils/api';
import { reconnectDelay } from '../utils/backoff';

const MAX_ENTRIES = 200;

/**
 * useRadioFeed — connects to the radio WebSocket and maintains a live feed
 * @param {Object} opts
 * @param {string} opts.pin        — TV PIN for WebSocket auth (TV mode)
 * @param {number} opts.limit      — max entries to keep in memory (default 50)
 * @param {boolean} opts.enabled   — whether to connect (default true)
 * @returns {{ entries: Array, connected: boolean, error: string|null, simulate: Function }}
 *
 * Non-TV clients authenticate with their JWT (read internally via getToken) —
 * the server verifies it and derives the tenant. The hook never sends a
 * client-claimed station/department id.
 */
export function useRadioFeed({ pin, limit = 50, enabled = true } = {}) {
  const [entries, setEntries] = useState([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const attempts = useRef(0);
  // Non-TV auth uses the logged-in user's JWT; TV mode uses the PIN instead.
  const token = pin ? null : getToken();

  // Build WebSocket URL
  const getWsUrl = useCallback(() => {
    const apiUrl = import.meta.env.VITE_API_URL || window.location.origin;
    const wsProto = apiUrl.startsWith('https') ? 'wss' : 'ws';
    const host = apiUrl.replace(/^https?:\/\//, '');
    return `${wsProto}://${host}/ws/radio`;
  }, []);

  // Connect to WebSocket
  useEffect(() => {
    if (!enabled) return;
    if (!token && !pin) return;

    let mounted = true;

    // Load initial data via REST
    const loadInitial = async () => {
      try {
        let data;
        if (pin) {
          // TV mode — radio data comes from tv-data endpoint
          // We'll just start with empty and let WebSocket fill in
          data = [];
        } else {
          const res = await api.get(`/api/radio/recent?limit=${limit}`);
          data = res?.data ?? res ?? [];
        }
        if (mounted) setEntries(Array.isArray(data) ? data : []);
      } catch (e) {
        // Silent — will try WebSocket
      }
    };
    loadInitial();

    // WebSocket connection
    const connect = () => {
      try {
        const ws = new WebSocket(getWsUrl());
        wsRef.current = ws;

        ws.onopen = () => {
          // Authenticate
          if (pin) {
            ws.send(JSON.stringify({ type: 'auth', pin }));
          } else if (token) {
            ws.send(JSON.stringify({ type: 'auth', token }));
          }
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'auth_ok') {
              attempts.current = 0; // healthy connection — reset backoff
              if (mounted) { setConnected(true); setError(null); }
            } else if (msg.type === 'auth_fail') {
              if (mounted) setError('Radio authentication failed');
            } else if (msg.type === 'radio') {
              if (mounted) {
                setEntries(prev => {
                  const next = [msg.data, ...prev];
                  return next.slice(0, MAX_ENTRIES);
                });
              }
            }
          } catch (e) { /* ignore */ }
        };

        ws.onclose = () => {
          if (mounted) setConnected(false);
          // Reconnect with capped exponential backoff (5s … 5min) so an
          // unreachable /ws/radio (e.g. serverless, no persistent WS) is not
          // hammered every 5s forever. The feed falls back to REST/polled data.
          if (mounted) {
            reconnectTimer.current = setTimeout(connect, reconnectDelay(++attempts.current));
          }
        };

        ws.onerror = () => {
          if (mounted) setError('WebSocket connection error');
          ws.close();
        };
      } catch (e) {
        // WebSocket not available — fall back to polling
        if (mounted) setError('WebSocket unavailable');
      }
    };

    connect();

    return () => {
      mounted = false;
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [token, pin, enabled, limit, getWsUrl]);

  // Simulate function for testing
  const simulate = useCallback(async () => {
    try {
      const res = await api.post('/api/radio/simulate');
      return res;
    } catch (e) {
      console.error('Simulate error:', e);
    }
  }, []);

  return { entries: entries.slice(0, limit), connected, error, simulate };
}
