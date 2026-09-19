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
/** A general spell a Vance has learned their own way (The Way, p57). */
const learned = (system = {}) => spell({ converted: true, ...system });
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

  test("nothing to cast a spell a Vance learned their way, once it is in mind", () => {
    // "Vances may wish to learn other spells and use them in their Vancian
    // spell method, storing them in their mind for later" (The Way, p57).
    // Stored: it is being held that makes casting free, not having been
    // converted.
    assert.equal(practice.costOf(learned({ level: 4, prepared: true })), 0);
  });

  test("but its level while it is not, because that way of casting stays", () => {
    // The whole of what conversion does is add a second way to cast. Charging
    // nothing for a converted spell that is not in mind would let a Vance cast
    // every general spell they own for free by learning it and never preparing
    // it — and taking the ordinary way away would be worse, because it is the
    // way the spell could be cast before anyone converted anything.
    assert.equal(practice.costOf(learned({ level: 4 })), 4);
    assert.equal(practice.costOf(spell({ level: 4 })), 4, "as it was before");
  });

  test("one of the tradition's own never has a Sorcery price", () => {
    // It has no other way to be cast, so there is no price for casting it that
    // way. canCast is what refuses it when nothing is prepared.
    assert.equal(practice.costOf(vancian({ level: 4, prepared: true })), 0);
    assert.equal(practice.costOf(vancian({ level: 4 })), 0);
  });

  test("but its level to keep one", () => {
    // "if we want to retain the ability to cast that spell again… there is a
    // Sorcery cost involved equal to the spell's level".
    assert.equal(practice.retainCost(vancian({ level: 4, prepared: true })), 4);
    assert.equal(practice.retainCost(learned({ level: 4, prepared: true })), 4,
      "a converted spell is kept the same way");
    assert.equal(practice.retainCost(learned({ level: 4 })), 0,
      "but one cast the ordinary way was never in mind to be kept");
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

  test("a prepared spell of the tradition costs nothing, so an empty pool is no bar", () => {
    const answer = practice.canCast(caster(0), vancian({ level: 8, prepared: true }));
    assert.equal(answer.allowed, true);
    assert.equal(answer.cost, 0);
  });

  test("a no-cost forte ability is usable on an empty pool", () => {
    assert.equal(practice.canCast(caster(0), ability({ level: 7, noCost: true })).allowed, true);
  });

  test("a converted spell not in mind is cast the ordinary way, and paid for", () => {
    // Not refused. It is a general spell that a Vance has also learned their
    // way, and the way it could always be cast does not go away.
    const answer = practice.canCast(caster(9), learned({ level: 4 }));
    assert.equal(answer.allowed, true);
    assert.equal(answer.cost, 4);

    // And still refused when the pool cannot pay for it, like any other spell.
    assert.equal(practice.canCast(caster(3), learned({ level: 4 })).allowed, false);
  });

  test("a converted spell in mind costs nothing, so an empty pool is no bar", () => {
    const answer = practice.canCast(caster(0), learned({ level: 4, prepared: true }));
    assert.equal(answer.allowed, true);
    assert.equal(answer.cost, 0);
  });
});

describe("what a practice is called", () => {

  test("a spell of a tradition names it; a general spell does not", () => {
    // "General" is the absence of a tradition rather than a fifth one.
    assert.equal(practice.kindLabelFor(spell()), "Spell");
    assert.equal(practice.kindLabelFor(vancian()), "Vance Spell");
  });

  test("a spell learned the Vancian way says so on top of what it is", () => {
    // Both facts, because both are true: the deck it was printed in, and the
    // way this character holds it. A row that said only the first would have a
    // general spell casting free with nothing to explain it.
    assert.equal(practice.kindLabelFor(learned()), "Spell, Vancian");
    assert.equal(practice.kindLabelFor(learned({ spellType: "weaver" })), "Weaver Spell, Vancian");
  });

  test("nothing but a spell is ever called Vancian", () => {
    // `converted` is a field on the spell model alone, but the label is
    // composed for four kinds of practice and only one of them has it.
    assert.equal(practice.kindLabelFor({ type: "Incantation", system: { converted: true } }),
      "Incantation");
  });
});

describe("whether a depletion can be rolled at all", () => {

  /* The number is what a d10 must land in; the parenthesis says when to throw
   * it, and that half is the table's. These cases are the ones that decide
   * whether the column is a button or just words. */

  test("a single number, and the moment it names is ignored", () => {
    assert.deepEqual(practice.depletionRange("0 (check each round)"), { low: 0, high: 0 });
    assert.deepEqual(practice.depletionRange("0 (check each use)"), { low: 0, high: 0 });
    assert.deepEqual(practice.depletionRange("2 (check each hour)"), { low: 2, high: 2 });
  });

  test("a range, written with the dash the books actually use", () => {
    // Every ranged entry in the packs uses an en dash and not one a hyphen. A
    // pattern accepting only "-" read "0–1" as 0 and understated depletion on
    // every ranged item in the game.
    assert.deepEqual(practice.depletionRange("0–1 (check each use)"), { low: 0, high: 1 });
    assert.deepEqual(practice.depletionRange("0—4 (check each hour)"), { low: 0, high: 4 });
    assert.deepEqual(practice.depletionRange("1-3"), { low: 1, high: 3 });
  });

  test("nothing to roll for one that ends on a sunrise or a sunset", () => {
    // 171 of the 541 entries across the packs are these. They are conditions,
    // not rolls, and offering a die for them would invent a rule.
    assert.equal(practice.depletionRange("Ends automatically when the sun next sets"), null);
    assert.equal(practice.depletionRange("When the sun next rises or sets"), null);
  });

  test("a number inside a condition is not a range", () => {
    /* "Ends automatically when you suffer 5 points of cumulative cold damage."
     * An unanchored pattern finds the 5 and offers a depletion of 5 that the
     * book never wrote. Two entries read like this, and both used to roll. */
    assert.equal(practice.depletionRange(
      "Ends automatically when you suffer 5 points of cumulative cold damage"), null);
  });

  test("the dash used to mean it does not deplete", () => {
    assert.equal(practice.depletionRange("—"), null);
    assert.equal(practice.depletionRange(""), null);
    assert.equal(practice.depletionRange(null), null);
    assert.equal(practice.depletionRange(undefined), null);
  });
});

describe("what counts as a practice", () => {

  /* The four things a character casts or uses as an action. The hotbar asks
   * this question of anything dropped on it: a spell becomes a macro that
   * casts, and a coat is left to core, which makes one that opens its sheet. */
  test("the four kinds", () => {
    for (const type of ["Spell", "Incantation", "ForteAbility", "MinorMagic"]) {
      assert.equal(practice.isPractice({ type }), true, type);
    }
  });

  test("a skill is not one of them", () => {
    // It is used, and it goes on the bar, but it costs no Sorcery and is
    // rolled rather than cast. The two paths part here.
    assert.equal(practice.isPractice({ type: "Skill" }), false);
  });

  test("nor is anything merely held", () => {
    for (const type of ["Gear", "Ephemera", "ObjectOfPower", "Secret", "Heart"]) {
      assert.equal(practice.isPractice({ type }), false, type);
    }
  });

  test("nothing at all is not one either", () => {
    assert.equal(practice.isPractice(null), false);
    assert.equal(practice.isPractice({}), false);
  });

  test("the list is the one the cost rule uses", () => {
    // They coincide across the whole of the books, so there is one list; a
    // second that drifted would cast something for free that should pay.
    assert.deepEqual([...practice.PRACTICE_TYPES].sort(),
      ["ForteAbility", "Incantation", "MinorMagic", "Spell"]);
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
