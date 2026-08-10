/**
 * utils/broadcastSubscriber.js — ONE realtime channel per topic, ref-counted.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * 🔴 WHY THIS EXISTS: a CRITICAL bug that reached production, 2026-08-06
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * `supabase.channel(topic)` is NOT a constructor. It is lookup-or-create: two callers asking
 * for the same topic get the SAME object. So a component that does
 *
 *     const ch = supabase.channel(topic).on(...).subscribe();
 *     return () => supabase.removeChannel(ch);        // ← looks obviously correct
 *
 * destroys that channel for every OTHER component using the topic. Each caller reads as
 * correct in isolation; the defect exists only *between* them, which is why it survives
 * review — and why it must be fixed in a shared helper rather than by asking people to
 * remember.
 *
 * What it cost: the 4C.4 fault panel and trouble banner both subscribed to the DISPATCH topic
 * that App.jsx owns. Opening the CAD page — or merely toggling the panel's scope filter, since
 * its cleanup runs whenever the callback identity changes — unsubscribed LIVE DISPATCH PUSH
 * app-wide for the rest of the session. Silently, with every screen still working off its 20s
 * poll. That is precisely the survivable-without-an-alarm shape this product already lost 34
 * days to in 2026-06/07.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * THE CONTRACT
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *  · one channel per topic, created once;
 *  · one `.on('broadcast', {event})` binding per (topic, event), fanned out to N handlers —
 *    binding per subscriber would deliver the message N times to the first callback;
 *  · `.subscribe()` called exactly once per channel;
 *  · unsubscribe removes only that handler, and ONLY THE LAST LEAVER tears the channel down;
 *  · unsubscribe is idempotent — React StrictMode invokes effect cleanups twice in dev, and a
 *    second call must not decrement someone else's claim.
 *
 * Kept free of `import.meta.env` and of the supabase client import ON PURPOSE, so the contract
 * above is testable in plain Node against a fake that reproduces lookup-or-create. A helper
 * whose whole job is preventing a cross-component bug has to be provable.
 */

/**
 * @param {object|null} client  a supabase client (or a fake with .channel/.removeChannel)
 * @param {{onStatus?: (topic:string,status:string)=>void,
 *          onMessage?: () => void,
 *          onTopicGone?: (topic:string) => void}} [hooks]
 * @returns {(topic: string|null, event: string, handler: Function) => (() => void)}
 */
export function makeBroadcastSubscriber(client, hooks = {}) {
  const shared = new Map(); // topic -> { channel, handlers: Map<event, Set<fn>>, subscribed }
  const { onStatus, onMessage, onTopicGone } = hooks;

  function subscribeBroadcast(topic, event, handler) {
    // A null topic means "no department known". Never fall back to a default tenant — the
    // polls carry the surface until a department is resolved.
    if (!topic || !client || typeof handler !== 'function') return () => {};

    let entry = shared.get(topic);
    if (!entry) {
      entry = { channel: client.channel(topic), handlers: new Map(), subscribed: false };
      shared.set(topic, entry);
    }

    // ⚠ A LIST OF SUBSCRIPTION RECORDS, NOT A Set OF FUNCTIONS.
    // The first version used `Set<fn>`, which silently collapses two components that pass the
    // SAME handler reference into one entry — so the first to unmount tore the channel down
    // while the second was still live, which is the exact bug this helper exists to prevent,
    // surviving inside the fix. Found because a mutation test that removed the idempotence
    // guard stayed GREEN: the assertion was theatre, and chasing why exposed this.
    // Each call gets its own record; identity is the record, never the function.
    let set = entry.handlers.get(event);
    if (!set) {
      set = [];
      entry.handlers.set(event, set);
      entry.channel.on('broadcast', { event }, (payload) => {
        if (onMessage) onMessage();
        // Read the set fresh: a handler may unsubscribe from inside another handler.
        for (const rec of [...(entry.handlers.get(event) || [])]) {
          try { rec.fn(payload); } catch (e) {
            // One bad handler must not stop the others, and must not kill the channel.
            console.error(`[realtime] ${topic}/${event} handler threw`, e);
          }
        }
      });
    }
    const record = { fn: handler };
    set.push(record);

    if (!entry.subscribed) {
      entry.subscribed = true;
      entry.channel.subscribe((status) => { if (onStatus) onStatus(topic, status); });
    }

    let released = false;
    return function unsubscribe() {
      if (released) return;
      released = true;
      const e = shared.get(topic);
      if (!e) return;
      const s = e.handlers.get(event);
      if (s) {
        const i = s.indexOf(record);
        if (i !== -1) s.splice(i, 1);
        if (s.length === 0) e.handlers.delete(event);
      }
      // THE WHOLE FIX IS THIS CONDITION.
      if (e.handlers.size === 0) {
        shared.delete(topic);
        if (onTopicGone) onTopicGone(topic);
        try { client.removeChannel(e.channel); } catch { /* already gone */ }
      }
    };
  }

  subscribeBroadcast._openTopicCount = () => shared.size;
  return subscribeBroadcast;
}
