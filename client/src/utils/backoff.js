// backoff.js — capped exponential backoff for reconnect loops.
//
// Long-lived screens (TV wall display, dispatcher board) keep persistent
// WebSocket/SSE connections. On serverless those connections drop or fail and
// the client reconnects. A FIXED short interval (e.g. every 5s) means a dead or
// unreachable endpoint gets hammered thousands of times a day, churning objects
// and degrading an always-on screen. Always reconnect with this backoff, reset
// the attempt counter to 0 on a successful open, and clear the timer on teardown.
//
// Schedule: 5s, 10s, 20s, 40s, 80s, 160s, then capped at 5min.
export function reconnectDelay(attempt, base = 5000, cap = 300000) {
  const n = Math.min(Math.max(attempt - 1, 0), 6);
  return Math.min(base * 2 ** n, cap);
}
