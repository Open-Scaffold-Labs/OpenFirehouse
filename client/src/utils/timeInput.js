/**
 * timeInput.js — make a native <input type="time"> behave the way people expect.
 *
 * THE PROBLEM (Matt, 2026-08-08). A native time input only opens its picker when you
 * hit the small clock glyph at the right-hand edge — a target a few pixels wide, and on
 * a mounted apparatus tablet, at arm's length, in motion, effectively invisible. Click
 * anywhere else in the field and nothing happens at all, which reads as a dead control.
 * An officer filling out a report should be able to tap the box OR type the digits,
 * whichever is faster, on any of the twenty time fields in this product.
 *
 * TYPING IS UNAFFECTED. This ADDS the picker to a click; it does not replace keyboard
 * entry, and it does not fire on focus (which would ambush anyone tabbing through a form
 * with the keyboard).
 *
 * `showPicker()` requires user activation, so a click is exactly the right trigger. It
 * throws NotAllowedError / NotSupportedError where the browser won't allow it, and a
 * throw inside an onClick must never break a form an officer is mid-way through — hence
 * the guard. Where it isn't supported, the field behaves exactly as it always did.
 *
 * Lives here rather than in a component because six components own time inputs. Six
 * copies of a helper is its own defect: the seventh gets forgotten.
 */

export function openTimePicker(e) {
  try {
    e.currentTarget.showPicker?.();
  } catch {
    /* not supported, or not user-activated — the field still types normally */
  }
}

/** Tailwind classes that go with it, so the affordance matches the behaviour. */
export const TIME_INPUT_CURSOR = 'cursor-pointer';

export default openTimePicker;
