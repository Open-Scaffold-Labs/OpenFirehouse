/**
 * fabRail.js — the geometry of the app's floating widget rail, in ONE place.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * There was no rail. There were three widgets mounted from two different files
 * (VoiceAssistant from Layout.jsx; DictationWidget and AssistantWidget from
 * App.jsx), each hardcoding its own offset — `right-6`, `right-[5.5rem]`,
 * `right-[10rem]` — a manual daisy-chain of magic numbers that only looked like a
 * stack because the three constants happened to differ by 56px. Nothing enforced
 * that, nothing documented it, and no page could discover the band they occupy.
 *
 * That cost a measured defect on production (2026-08-04): laid out as a
 * horizontal row the three buttons claim a 216px-wide band up the right edge of
 * the VIEWPORT, and the permits register pins its row actions to the right edge
 * of the CONTENT — so a hit-test found the dictation button sitting on top of the
 * Retire control on 2 of 6 rows. Retire is destructive on a legal record, so it
 * was both unreachable and mis-aimable.
 *
 * WHY A VERTICAL RAIL, AND WHY PADDING WAS NOT THE ANSWER
 * ───────────────────────────────────────────────────────
 * A `position: fixed` overlay is anchored to the viewport, so it is over SOME row
 * at SOME scroll offset no matter how much bottom padding the page adds. (The
 * register had `pb-24` for exactly this and it did not help — that padding buys
 * clearance at the END of the document, not at the bottom of the viewport.) The
 * overlap is therefore only fixable on the HORIZONTAL axis: either content stops
 * using the right edge, or the rail stops claiming 216px of it.
 *
 * Stacking vertically claims 56px instead of 216 — a 74% narrower band, app-wide,
 * for every table rather than just this one. No button is removed, no affordance
 * moves out of reach, and the rail still reads as one group.
 *
 * ORDER IS BY REACH, NOT BY IMPORTANCE: the bottom slot is the easiest to hit on
 * a mounted iPad, so it goes to the widget used most often from a page.
 */

/** Rail slots, bottom-up. Add a slot here — never a fresh `bottom-` literal in a widget. */
export const FAB_SLOT = {
  assistant: 'bottom-6',            //  1st: AI Assistant   (App.jsx)
  dictation: 'bottom-[5.5rem]',     //  2nd: Dictation      (App.jsx)
  voice:     'bottom-[10rem]',      //  3rd: Voice          (Layout.jsx)
  feedback:  'bottom-[14.5rem]',    //  4th: Feedback pill  (FeedbackWidget.jsx)
};

/**
 * Every slot shares this horizontal offset — that is what makes the band 56px
 * wide instead of 216. `right-3` rather than `right-6`: measured on prod, the
 * register card's own right gutter is ~59px and its rightmost row control ends
 * ~71px from the viewport edge, so a 56px rail at a 24px offset still overlapped
 * it by 9px. At 12px the rail occupies the outer 68px and the controls clear it.
 */
export const FAB_RAIL_X = 'right-3';

/**
 * A trigger button in the rail: `` className={`${fabSlotCls('dictation')} w-14 h-14 …`} ``
 *
 * Deliberately does NOT set z-index. The widgets legitimately differ (the feedback
 * pill sits at z-30, under the assistant panels at z-50) and folding that in here
 * would flatten a real distinction to make the helper look tidier.
 *
 * Panels are positioned per-widget and open to the LEFT of the rail (`right-20`).
 * They are allowed to overlay content: a panel is user-opened and user-dismissed,
 * so covering the page while open is expected. It is the always-present TRIGGERS
 * that must not.
 */
export function fabSlotCls(slot) {
  return `fixed ${FAB_SLOT[slot]} ${FAB_RAIL_X}`;
}

/**
 * THE RESERVED BAND — and why narrowing the rail was necessary but not sufficient.
 *
 * Consolidating three widgets into one 56px column (2026-08-04) fixed the permits
 * register, whose rightmost control happened to end ~71px from the viewport edge —
 * just outside the band. That fix was then treated as "the occlusion problem is
 * solved", and it was not: it moved the boundary, it did not give anyone a way to
 * stay on the right side of it.
 *
 * Measured on production 2026-08-06, 1440px viewport: the rail's leftmost edge is
 * at x=1372, so it claims the outer **68px**. A 25-point hit-test over every visible
 * control on the incident surfaces then found:
 *   · `Delete incident` on #/incidents — up to **68% covered**, four rows at once.
 *     A destructive action on a subpoenable legal record, partly unclickable and
 *     wholly mis-aimable. Exactly the `Retire` defect that created this file.
 *   · `Analyze` on #/incident-intel — 8-20% covered, at three scroll positions.
 * Both end 48-53px from the edge, i.e. INSIDE the band. Nothing warned them.
 *
 * ⚠️ VERTICAL PADDING CANNOT FIX THIS — that is written at the top of this file and
 * is worth repeating here, because it is the fix everyone reaches for first. A
 * `fixed` element is anchored to the VIEWPORT, so it sits over some row at some
 * scroll offset no matter how much bottom padding the document has. The overlap is
 * only addressable on the HORIZONTAL axis, which is what this gutter is.
 *
 * USE IT on any container whose interactive controls reach the right edge of a
 * full-width content area — row action columns, right-aligned buttons in a wide
 * card. Do NOT sprinkle it on centred or narrow content; it is a reservation, not
 * a margin, and reserving space nobody was using just wastes the column.
 */
export const FAB_RAIL_RESERVE_PX = 68;

/** Tailwind gutter for a container whose controls reach the right edge. 68px band + 4px gap. */
export const FAB_RAIL_GUTTER = 'pr-[72px]';
