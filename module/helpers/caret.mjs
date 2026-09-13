/**
 * Invisible Sun — keeping the caret where the typist left it
 *
 * An ApplicationV2 window built as a single part rebuilds the whole of itself
 * on every render, which means a field being typed into is replaced under the
 * typist. Core saves which field had focus and puts the focus back, but a
 * freshly built input starts with its caret at position zero — so the next
 * letter lands in front of everything already there and "flameward" arrives as
 * "wardmefla".
 *
 * Core saves which field to return to. This saves where in it.
 *
 * Written once and shared, because it is needed by every window that re-renders
 * as you type — the compendium browser and the portrait matcher so far — and
 * two copies of a rule like this is two copies to get wrong. It reads and
 * writes DOM only, so it can be tested against a plain object standing in for
 * an element.
 */

/**
 * Which fields have a caret worth keeping.
 *
 * Asked of the type rather than of the element, because reading selectionStart
 * off a number or an email input throws rather than answering.
 */
const CARET_TYPES = new Set(["text", "search", "url", "tel", "password"]);

export function hasCaret(el) {
  if (!el) return false;
  if (el.tagName === "TEXTAREA") return true;
  return el.tagName === "INPUT" && CARET_TYPES.has(el.type);
}

/**
 * Note where the caret is, on the way out.
 *
 * Call from `_preSyncPartState`, having called super first. Does nothing unless
 * something with a caret actually had focus, so a window nobody was typing in
 * pays nothing.
 */
export function saveCaret(priorElement, state) {
  const focused = priorElement?.querySelector(":focus");
  if (!hasCaret(focused)) return;
  state.caret = [focused.selectionStart, focused.selectionEnd, focused.selectionDirection];
}

/**
 * Put it back, on the way in.
 *
 * Call from `_syncPartState`, having called super first — core has restored the
 * focus by then, and `state.focus` is the selector it used.
 *
 * Restored even where the text came back different: setSelectionRange clamps to
 * what is actually there, so the worst this does is land at the end, and the
 * start is never the better guess.
 */
export function restoreCaret(newElement, state) {
  if (!state?.caret || !state?.focus) return;
  const field = newElement?.querySelector(state.focus);
  if (hasCaret(field)) field.setSelectionRange(...state.caret);
}
