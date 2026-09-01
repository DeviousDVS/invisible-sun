/**
 * Invisible Sun — what a flux does to a character
 *
 * These could not be written until flux.mjs stopped importing the board and the
 * picker: an app reads `foundry.applications.api` as it loads, so this module
 * and dice.mjs could not be loaded in Node at all. They are handed in now, and
 * the code that writes to a vislae is reachable.
 *
 * The actor below records what it was asked to do rather than doing it. What
 * matters is that the right method was called with the right numbers — whether
 * `addVex` clamps correctly is ISUNActor's business and is tested against a
 * real one.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

import { stubFoundry, unstubFoundry } from "./foundry-stub.mjs";
import * as flux from "../../module/helpers/flux.mjs";

before(() => stubFoundry());
after(() => unstubFoundry());

/** A vislae that writes down what was done to it. */
function vislae({ sorcery = 5, hidden = 10 } = {}) {
  const calls = [];
  return {
    calls,
    system: { stats: { hiddenKnowledge: { value: hidden },
                       qualia: { pools: { sorcery: { value: sorcery } } } } },
    async addVex(pool, amount) { calls.push(["addVex", pool, amount]); return amount; },
    async adjustPool(pool, delta) { calls.push(["adjustPool", pool, delta]); return 0; },
    async applyDamage(options) { calls.push(["applyDamage", options]); return {}; },
    async update(data) { calls.push(["update", data]); }
  };
}

describe("applying what the chart said", () => {

  test("a vex goes to the named pool", async () => {
    const actor = vislae();
    const said = await flux.applyEffects(actor, [{ kind: "vex", pool: "sorcery", amount: 3 }]);

    assert.deepEqual(actor.calls, [["addVex", "sorcery", 3]]);
    assert.deepEqual(said, ["3 vex added to Sorcery"],
      "the card says what changed, in the pool's own name");
  });

  test("a pool loss is a spend, not a vex", async () => {
    // "You lose 1 Sortilege out of your pool" takes the bene held, not the
    // allocation, and is nothing to do with vexing.
    const actor = vislae();
    const said = await flux.applyEffects(actor, [{ kind: "pool", pool: "sortilege", amount: -1 }]);

    assert.deepEqual(actor.calls, [["adjustPool", "sortilege", -1]]);
    assert.deepEqual(said, ["1 Sortilege spent"], "reported as a count, not as a negative");
  });

  test("an Anguish is mental damage, taken directly", async () => {
    // Not an Injury: "You suffer 1 Anguish" is the Anguish itself, and the
    // Injury track is a separate path that converts into one.
    const actor = vislae();
    await flux.applyEffects(actor, [{ kind: "anguish", pool: "", amount: 1 }]);

    assert.deepEqual(actor.calls,
      [["applyDamage", { amount: 1, type: "mental", direct: true }]]);
  });

  test("a Wound is physical damage, taken directly", async () => {
    const actor = vislae();
    await flux.applyEffects(actor, [{ kind: "wound", pool: "", amount: 1 }]);

    assert.deepEqual(actor.calls,
      [["applyDamage", { amount: 1, type: "physical", direct: true }]]);
  });

  test("Hidden Knowledge comes off the total, never below nothing", async () => {
    const actor = vislae({ hidden: 1 });
    await flux.applyEffects(actor, [{ kind: "hiddenKnowledge", pool: "", amount: -2 }]);

    assert.deepEqual(actor.calls, [["update", { "system.stats.hiddenKnowledge.value": 0 }]]);
  });

  test("nothing at all for the ninety entries that say nothing", async () => {
    const actor = vislae();
    assert.deepEqual(await flux.applyEffects(actor, []), []);
    assert.deepEqual(actor.calls, []);
  });

  test("a pool the character has not got is passed over quietly", async () => {
    /* addVex answers null for a pool that does not exist, and a line saying
     * something happened when nothing did would be worse than silence. */
    const actor = vislae();
    actor.addVex = async () => null;
    assert.deepEqual(await flux.applyEffects(actor, [{ kind: "vex", pool: "nonsense", amount: 1 }]), []);
  });

  test("several effects are all applied, and all reported", async () => {
    // No chart entry states two, but the field is an array and a later book may.
    const actor = vislae();
    const said = await flux.applyEffects(actor, [
      { kind: "vex", pool: "intellect", amount: 1 },
      { kind: "anguish", pool: "", amount: 1 }
    ]);
    assert.equal(actor.calls.length, 2);
    assert.equal(said.length, 2);
  });
});

describe("what a rolled flux records on its message", () => {

  test("the count, the chart, and who it happened to", async () => {
    const flag = flux.flagFor({ fluxCount: 2, fluxIntensity: "grand", actor: { id: "abc" } });
    assert.deepEqual(flag, { count: 2, intensity: "grand", actor: "abc", done: false });
  });

  test("no actor is null rather than missing", async () => {
    // A roll made with no actor still flags, so the card can say a flux happened
    // even when there is nobody to give Despair to.
    assert.equal(flux.flagFor({ fluxCount: 1, fluxIntensity: "minor" }).actor, null);
  });

  test("done starts false, because nothing has been done", async () => {
    assert.equal(flux.flagFor({ fluxCount: 1, fluxIntensity: "minor" }).done, false);
  });
});
