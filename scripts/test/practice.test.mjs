/**
 * Invisible Sun — what it takes to use a practice
 *
 * The rules these hold to are the ones a table argues about: what a thing
 * costs, whether it can be used at all, and how many dice it brings.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

import { stubFoundry, unstubFoundry } from "./foundry-stub.mjs";
import * as practice from "../../module/helpers/practice.mjs";

before(() => stubFoundry());
after(() => unstubFoundry());

const spell = (system = {}) => ({ type: "Spell", name: "A spell",
  system: { level: 3, spellType: "general", ...system } });
const vancian = (system = {}) => spell({ spellType: "vance", ...system });
const ability = (system = {}) => ({ type: "ForteAbility", name: "An ability",
  system: { level: 2, bonusDice: 0, ...system } });

/** A vislae with this much left in Sorcery. */
const caster = (sorcery) => ({ system: { stats: { qualia: { pools: { sorcery: { value: sorcery } } } } } });

describe("what a practice costs", () => {

  test("its level, for most things", () => {
    // "whatever Sorcery cost is required to create the effect (which is almost
    // always equal to the practice's level)" (The Way, p8).
    assert.equal(practice.costOf(spell({ level: 3 })), 3);
    assert.equal(practice.costOf({ type: "Incantation", system: { level: 5 } }), 5);
    assert.equal(practice.costOf(ability({ level: 2 })), 2);
  });

  test("nothing, for a forte ability that says so", () => {
    // 74 of the 491 are marked no-cost.
    assert.equal(practice.costOf(ability({ level: 7, noCost: true })), 0);
  });

  test("nothing to cast a Vancian spell", () => {
    // "The spell is eager to be cast, so casting it requires no energy or
    // effort from us. Just an action" (The Key, Vance 1st degree).
    assert.equal(practice.costOf(vancian({ level: 4 })), 0);
  });

  test("but its level to keep one", () => {
    // "if we want to retain the ability to cast that spell again… there is a
    // Sorcery cost involved equal to the spell's level".
    assert.equal(practice.retainCost(vancian({ level: 4 })), 4);
    assert.equal(practice.retainCost(spell({ level: 4 })), 0, "nothing else is retained");
  });

  test("nothing at all for something that is not a practice", () => {
    assert.equal(practice.costOf({ type: "Gear", system: { level: 4 } }), 0);
    assert.equal(practice.costOf(null), 0);
  });
});

describe("how many dice a practice brings", () => {

  test("read out of the sentence the card prints", () => {
    assert.equal(practice.magicDiceOf(spell({ dice: "+1 die" })), 1);
    assert.equal(practice.magicDiceOf(spell({ dice: "+2 dice" })), 2);
    assert.equal(practice.magicDiceOf(spell({ dice: "+3 dice" })), 3);
  });

  test("a conditional die still counts", () => {
    // "+1 die if the object is in a being's possession" — the condition is the
    // player's to judge, and the dialog lets them take the die back. Counting
    // it as nothing hides a die they are owed more often than it saves one.
    assert.equal(practice.magicDiceOf(spell({ dice: "+1 die if the object is in a being’s possession" })), 1);
  });

  test("none when the card says nothing", () => {
    assert.equal(practice.magicDiceOf(spell({ dice: "" })), 0);
    assert.equal(practice.magicDiceOf(spell({})), 0);
  });

  test("a forte ability carries its own number", () => {
    assert.equal(practice.magicDiceOf(ability({ bonusDice: 2 })), 2);
    assert.equal(practice.magicDiceOf(ability({ bonusDice: 0 })), 0);
  });
});

describe("whether it can be used at all", () => {

  test("yes, when the Sorcery is there", () => {
    const answer = practice.canCast(caster(5), spell({ level: 3 }));
    assert.equal(answer.allowed, true);
    assert.equal(answer.cost, 3);
  });

  test("no, when the pool cannot pay", () => {
    const answer = practice.canCast(caster(2), spell({ level: 3 }));
    assert.equal(answer.allowed, false);
    assert.equal(answer.reason, "ISUN.CastNotEnoughSorcery");
    assert.equal(answer.cost, 3);
    assert.equal(answer.pool, 2);
  });

  test("exactly enough is enough", () => {
    assert.equal(practice.canCast(caster(3), spell({ level: 3 })).allowed, true);
  });

  test("no, when a Vancian spell is not in mind", () => {
    // Nothing prepared is nothing to cast, whatever the pool holds.
    const answer = practice.canCast(caster(9), vancian({ level: 4, prepared: false }));
    assert.equal(answer.allowed, false);
    assert.equal(answer.reason, "ISUN.CastNotPrepared");
  });

  test("a prepared Vancian spell costs nothing, so an empty pool is no bar", () => {
    const answer = practice.canCast(caster(0), vancian({ level: 8, prepared: true }));
    assert.equal(answer.allowed, true);
    assert.equal(answer.cost, 0);
  });

  test("a no-cost forte ability is usable on an empty pool", () => {
    assert.equal(practice.canCast(caster(0), ability({ level: 7, noCost: true })).allowed, true);
  });
});

describe("the challenge a practice faces", () => {

  test("the level of what is targeted", () => {
    // "The challenge is the level of the target modified by defenses or other
    // factors" (The Way, p7).
    const user = { targets: new Set([{ actor: { system: { level: 6 } } }]) };
    assert.equal(practice.challengeFor(user), 6);
  });

  test("zero when nothing is targeted", () => {
    // The commoner case: cast on yourself, on a willing being, or on nothing
    // that can object, and no roll is needed at all.
    assert.equal(practice.challengeFor({ targets: new Set() }), 0);
    assert.equal(practice.challengeFor({}), 0);
  });

  test("zero for a target with no level of its own", () => {
    const user = { targets: new Set([{ actor: { system: {} } }]) };
    assert.equal(practice.challengeFor(user), 0);
  });
});
