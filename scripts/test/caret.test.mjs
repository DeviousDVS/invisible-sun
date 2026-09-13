/**
 * Invisible Sun — keeping the caret where the typist left it
 *
 * A window built as one part rebuilds all of itself on every render, so a field
 * being typed into is replaced mid-word. Core restores the focus; without these
 * the caret came back at nought and every letter after the first landed in
 * front of the ones already there — "flameward" arriving as "wardmefla".
 *
 * It reads and writes DOM and nothing else, so a plain object stands in for an
 * element and the whole of it can be tested in Node.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { hasCaret, saveCaret, restoreCaret } from "../../module/helpers/caret.mjs";

/** An input, as much of one as this code ever looks at. */
const input = (type, { start = 0, end = 0, direction = "none" } = {}) => {
  const el = {
    tagName: "INPUT", type,
    selectionStart: start, selectionEnd: end, selectionDirection: direction,
    ranges: [],
    setSelectionRange(...args) { el.ranges.push(args); }
  };
  return el;
};

/** Something to query for it. */
const holding = (focused, found = focused) => ({
  querySelector: (selector) => (selector === ":focus" ? focused : found)
});

describe("which fields have a caret worth keeping", () => {

  test("the text-like inputs do", () => {
    for (const type of ["text", "search", "url", "tel", "password"]) {
      assert.equal(hasCaret(input(type)), true, type);
    }
  });

  test("and a textarea", () => {
    assert.equal(hasCaret({ tagName: "TEXTAREA" }), true);
  });

  /* Asked of the type rather than of the element, because reading
   * selectionStart off one of these throws rather than answering. */
  test("a number or an email input does not", () => {
    assert.equal(hasCaret(input("number")), false);
    assert.equal(hasCaret(input("email")), false);
    assert.equal(hasCaret(input("checkbox")), false);
  });

  test("nor anything that is not a field at all", () => {
    assert.equal(hasCaret({ tagName: "DIV" }), false);
    assert.equal(hasCaret(null), false);
    assert.equal(hasCaret(undefined), false);
  });
});

describe("noting where the caret was, on the way out", () => {

  test("the whole selection, not merely the position", () => {
    const state = {};
    saveCaret(holding(input("search", { start: 3, end: 7, direction: "forward" })), state);
    assert.deepEqual(state.caret, [3, 7, "forward"]);
  });

  test("nothing is noted when nothing had focus", () => {
    const state = {};
    saveCaret(holding(null), state);
    assert.equal("caret" in state, false);
  });

  test("nor when the focused thing has no caret to note", () => {
    const state = {};
    saveCaret(holding(input("number", { start: 2, end: 2 })), state);
    assert.equal("caret" in state, false);
  });

  test("a window that is not there is not an error", () => {
    const state = {};
    assert.doesNotThrow(() => saveCaret(null, state));
    assert.equal("caret" in state, false);
  });
});

describe("putting it back, on the way in", () => {

  test("the field core refocused gets the selection it had", () => {
    const field = input("search");
    restoreCaret(holding(null, field), { caret: [4, 4, "none"], focus: 'input[name="filter"]' });
    assert.deepEqual(field.ranges, [[4, 4, "none"]]);
  });

  /* Core saves which field to go back to; this saves where in it. Without its
   * selector there is nothing to put the caret into. */
  test("nothing happens without a caret or without a focus", () => {
    const field = input("search");
    restoreCaret(holding(null, field), { focus: 'input[name="filter"]' });
    restoreCaret(holding(null, field), { caret: [4, 4, "none"] });
    restoreCaret(holding(null, field), {});
    restoreCaret(holding(null, field), undefined);
    assert.deepEqual(field.ranges, []);
  });

  test("a field that came back as something without a caret is left alone", () => {
    const field = input("number");
    restoreCaret(holding(null, field), { caret: [4, 4, "none"], focus: "#x" });
    assert.deepEqual(field.ranges, []);
  });

  test("a field that did not come back at all is not an error", () => {
    assert.doesNotThrow(() =>
      restoreCaret(holding(null, null), { caret: [4, 4, "none"], focus: "#gone" }));
  });

  /* Restored even where the text came back shorter: setSelectionRange clamps to
   * what is actually there, so the worst this does is land at the end — and the
   * start is never the better guess. */
  test("a caret past the end of the new text is still offered", () => {
    const field = input("search");
    restoreCaret(holding(null, field), { caret: [99, 99, "none"], focus: "#x" });
    assert.deepEqual(field.ranges, [[99, 99, "none"]]);
  });
});
