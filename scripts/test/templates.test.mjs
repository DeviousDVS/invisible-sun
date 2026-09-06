/**
 * Invisible Sun — the {{#times}} block helper
 *
 * A block helper decides two things for the body it renders: the context, and
 * the data frame. `times` was careful about the first and destroyed the second,
 * handing Handlebars a bare `{ index: i }` in place of the frame it was given.
 *
 * That is a silent failure by construction. Every @-value other than @index
 * read as undefined inside the block, so `{{#if @root.isGM}}` in there took the
 * false arm for a GM and a player alike — no error, no missing template, just a
 * control that never appeared for anybody. It went unnoticed because nothing
 * had asked for @root inside a {{#times}} until the wound pips did.
 *
 * Handlebars is stubbed rather than imported: the helper's contract is with the
 * two functions it calls, and createFrame below is Handlebars' own — a shallow
 * copy carrying _parent, which is what makes @../index reachable.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

import { registerHandlebarsHelpers } from "../../module/helpers/templates.mjs";

let times;
let ordinal;

before(() => {
  const registered = {};
  globalThis.Handlebars = {
    registerHelper: (name, fn) => { registered[name] = fn; },
    createFrame: (object) => {
      const frame = Object.assign({}, object);
      frame._parent = object;
      return frame;
    }
  };
  registerHandlebarsHelpers();
  times = registered.times;
  ordinal = registered.ordinal;
});

after(() => { delete globalThis.Handlebars; });

/** Render a {{#times n}} block, recording what each pass was handed. */
function run(n, context = {}, data = {}) {
  const passes = [];
  const block = {
    data,
    fn: (self, options) => {
      passes.push({ context: self, data: options.data });
      return `[${options.data.index}]`;
    }
  };
  const out = times.call(context, n, block);
  return { out, passes };
}

describe("looping a fixed number of times", () => {

  test("renders the body once per count, numbered from zero", () => {
    const { out, passes } = run(3);
    assert.equal(out, "[0][1][2]");
    assert.deepEqual(passes.map(p => p.data.index), [0, 1, 2]);
  });

  test("a count of zero renders nothing at all", () => {
    assert.equal(run(0).out, "");
  });

  test("the surrounding context is still the context", () => {
    const outer = { poolName: "sorcery" };
    const { passes } = run(2, outer);
    for (const pass of passes) assert.equal(pass.context, outer);
  });

  test("@root survives the block, which is what the pips depend on", () => {
    const root = { isGM: true };
    const { passes } = run(2, {}, { root });
    for (const pass of passes) {
      assert.equal(pass.data.root, root,
        "@root read as undefined inside the block, so {{#if @root.isGM}} was always false");
    }
  });

  test("an enclosing loop's index is still reachable as @../index", () => {
    const { passes } = run(2, {}, { index: 7, root: {} });
    for (const pass of passes) {
      assert.equal(pass.data._parent.index, 7);
    }
  });

  test("each pass gets its own frame, so one cannot see the next one's index", () => {
    const { passes } = run(3);
    assert.deepEqual(passes.map(p => p.data.index), [0, 1, 2]);
    assert.notEqual(passes[0].data, passes[1].data);
  });

  test("a block arriving with no frame of its own is still handled", () => {
    const block = { fn: (self, options) => String(options.data.index) };
    assert.equal(times.call({}, 2, block), "01");
  });
});

/**
 * The degree select reads "2nd" rather than "2", so the number and the word
 * after it make one phrase: "2nd Degree, Crafter".
 */
describe("saying a number in its order", () => {

  test("the three that are not th", () => {
    assert.equal(ordinal(1), "1st");
    assert.equal(ordinal(2), "2nd");
    assert.equal(ordinal(3), "3rd");
  });

  test("everything else in the first ten", () => {
    for (const n of [4, 5, 6, 7, 8, 9, 10]) assert.equal(ordinal(n), `${n}th`);
  });

  test("the teens are th, which is the whole reason for the rule", () => {
    assert.equal(ordinal(11), "11th", "not 11st");
    assert.equal(ordinal(12), "12th", "not 12nd");
    assert.equal(ordinal(13), "13th", "not 13rd");
  });

  test("past the teens the last digit decides again", () => {
    assert.equal(ordinal(21), "21st");
    assert.equal(ordinal(22), "22nd");
    assert.equal(ordinal(23), "23rd");
    assert.equal(ordinal(24), "24th");
  });

  test("and the hundred-and-teens are th as well", () => {
    assert.equal(ordinal(111), "111th");
    assert.equal(ordinal(112), "112th");
    assert.equal(ordinal(113), "113th");
    assert.equal(ordinal(121), "121st");
  });

  test("a degree the ladder does not have is not a crash", () => {
    assert.equal(ordinal(0), "0th");
    assert.equal(ordinal(undefined), "");
    assert.equal(ordinal("not a number"), "");
  });

  test("a string of digits is still a number", () => {
    assert.equal(ordinal("3"), "3rd");
  });
});
