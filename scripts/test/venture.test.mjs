/**
 * Invisible Sun — what a venture roll reports about itself
 *
 * Every one of these is about the shape of the answer rather than the odds.
 * `rollVenture` has four ways out — routine, assured, impossible, and an actual
 * roll — and anything downstream reads one object without knowing which way it
 * came. The Maker's Matrix reads `success` and nothing else, the challenge card
 * reads all four, and the chat template picks its outer class off `success`.
 *
 * They exist because two of those ways out used to leave `success` off the
 * object entirely. `undefined` reads as false, so an action the venture had
 * already covered — the Matrix's first challenge is level 1, which almost any
 * Maker covers — came back a failure while its own chat card said "Automatic
 * Success". The bench charged a day for it and sent the work down the catalyst
 * path.
 */
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { stubFoundry, unstubFoundry } from "./foundry-stub.mjs";

/**
 * What posting a card needs, on top of the shared fixture.
 *
 * Kept here rather than in foundry-stub.mjs: chat rendering is this file's
 * business, and the fixture is about the Sooth deck, the socket and the strings.
 */
function stubChat({ faces = [5] } = {}) {
  const posted = [];
  globalThis.foundry.applications = {
    handlebars: { renderTemplate: async (path, data) => JSON.stringify(data) }
  };
  globalThis.ChatMessage = { create: async (message) => (posted.push(message), message) };

  /* A die that lands where the test says. Foundry rolls a d10 as 1–10 and the
   * system maps 10 to 0, so a face is given in Foundry's terms. */
  let next = 0;
  globalThis.Roll = class {
    constructor(formula) {
      const counts = [...formula.matchAll(/(\d*)d(?:10|e)/g)]
        .map(m => Number(m[1] || 1));
      this.dice = counts.map(n => ({
        options: {},
        results: Array.from({ length: n }, () => ({ result: faces[next++ % faces.length] }))
      }));
    }
    async evaluate() { return this; }
  };
  return posted;
}

before(() => stubFoundry());
after(() => { unstubFoundry(); delete globalThis.ChatMessage; delete globalThis.Roll; });

let rollVenture;
beforeEach(async () => {
  ({ rollVenture } = await import("../../module/helpers/dice.mjs"));
});

describe("what comes back from a venture", () => {

  test("a routine action succeeded, and says so plainly", async () => {
    // "0 — Routine; never requires a die roll" (The Gate, p5). No dice, but the
    // question "did it succeed" still has an answer and it is yes.
    stubChat();
    const result = await rollVenture({ challenge: 0, venture: 0 });
    assert.equal(result.success, true);
    assert.equal(result.autoSuccess, true);
    assert.equal(result.routine, true);
  });

  test("an action the venture already covered succeeded too", async () => {
    // The bug this file was written for. A level 1 challenge against a venture
    // of 2 is assured; read through `success` it used to come back a failure.
    stubChat();
    const result = await rollVenture({ challenge: 1, venture: 2 });
    assert.equal(result.success, true);
    assert.equal(result.autoSuccess, true);
    assert.equal(result.routine, false, "assured, which is not the same as routine");
  });

  test("an impossible action failed, and says that plainly too", async () => {
    // A die reads 0 to 9, so a target of 10 cannot be met on one.
    stubChat();
    const result = await rollVenture({ challenge: 12, venture: 0 });
    assert.equal(result.success, false);
    assert.equal(result.impossible, true);
  });

  test("a rolled action reports the die", async () => {
    stubChat({ faces: [9] });
    const hit = await rollVenture({ challenge: 5, venture: 0 });
    assert.equal(hit.success, true);
    assert.equal(hit.autoSuccess, undefined, "it was rolled for");

    stubChat({ faces: [2] });
    const miss = await rollVenture({ challenge: 5, venture: 0 });
    assert.equal(miss.success, false);
  });

  test("every way out answers the plain question with a boolean", async () => {
    // The rule the four tests above are each an instance of, held on its own so
    // that a fifth way out of the function cannot be added without one.
    const ways = [
      { challenge: 0,  venture: 0 },   // routine
      { challenge: 1,  venture: 2 },   // assured
      { challenge: 12, venture: 0 },   // impossible
      { challenge: 5,  venture: 0 }    // rolled
    ];
    for (const way of ways) {
      stubChat();
      const result = await rollVenture(way);
      assert.equal(typeof result.success, "boolean",
        `challenge ${way.challenge} against venture ${way.venture}`);
    }
  });
});
