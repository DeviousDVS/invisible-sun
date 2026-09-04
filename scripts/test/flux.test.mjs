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

describe("turning the card before the roll is announced", () => {

  /* The card is meant to land before the account of what caused it, so the turn
   * has to happen before the message that carries the flux exists. Only a GM
   * may write the board, so a player has to ask — and what these pin down is
   * what happens when the asking goes each of its three ways. */

  let state;
  const arm = (turns = true) => {
    let called = 0;
    flux.listen({
      turnCard: async () => { called += 1; return turns ? { placed: ["a card"] } : { placed: [], reason: "ISUN.PathDeckEmpty" }; },
      chooseEffect: async () => null
    });
    return () => called;
  };

  before(() => { state = stubFoundry(); });
  after(() => unstubFoundry());

  test("a GM turns it themselves, and asks nobody", async () => {
    state.isGM = true;
    state.sent.length = 0;
    const calls = arm();

    assert.equal(await flux.turnAhead(), true);
    assert.equal(calls(), 1, "the card was turned here");
    assert.deepEqual(state.sent, [], "nothing went over the wire");
  });

  test("a GM whose deck is spent reports no turn", async () => {
    // The flag then stays live, and the card is still owed later.
    state.isGM = true;
    state.notified.length = 0;
    const calls = arm(false);

    assert.equal(await flux.turnAhead(), false);
    assert.equal(calls(), 1);
    assert.deepEqual(state.notified.map(n => n.kind), ["warn"],
      "silence would read as the flux having been handled");
  });

  test("a player asks the first active GM, and only that one", async () => {
    state.isGM = false;
    state.sent.length = 0;
    state.users = [
      { id: "zed", isGM: true, active: true },
      { id: "amy", isGM: true, active: true },
      { id: "bob", isGM: false, active: true },
    ];
    arm();

    const asked = flux.turnAhead();
    assert.equal(state.sent.length, 1, "one ask, not one per GM");
    const { payload } = state.sent[0];
    assert.equal(payload.action, "fluxTurnAhead");
    assert.equal(payload.gm, "amy", "nominated by id, so two GMs cannot both turn one");

    await state.receive({ action: "fluxTurnedAhead", id: payload.id, turned: true });
    assert.equal(await asked, true);
  });

  test("a player with no GM connected does not wait for one", async () => {
    // Nobody can turn it, so there is nothing to wait for and the roll goes on.
    state.isGM = false;
    state.sent.length = 0;
    state.users = [{ id: "bob", isGM: false, active: true },
                   { id: "gone", isGM: true, active: false }];
    arm();

    assert.equal(await flux.turnAhead(), false);
    assert.deepEqual(state.sent, [], "an absent GM is not asked");
  });

  test("an answer for somebody else's ask is ignored", async () => {
    state.isGM = false;
    state.sent.length = 0;
    state.users = [{ id: "amy", isGM: true, active: true }];
    arm();

    const asked = flux.turnAhead();
    await state.receive({ action: "fluxTurnedAhead", id: "not-mine", turned: true });
    await state.receive({ action: "fluxTurnedAhead", id: state.sent[0].payload.id, turned: false });
    assert.equal(await asked, false, "the ask resolves on its own answer, not the first one seen");
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

  test("but it starts done when the card is already out", async () => {
    /* The turn happens before this message exists, so the flag records it as
     * already handled — otherwise the GM finalising the effect would turn a
     * second one. */
    assert.equal(flux.flagFor({ fluxCount: 1, fluxIntensity: "minor", fluxTurned: true }).done, true);
  });
});
