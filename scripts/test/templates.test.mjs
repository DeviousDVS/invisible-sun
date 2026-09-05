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
