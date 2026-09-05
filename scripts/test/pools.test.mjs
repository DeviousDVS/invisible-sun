/**
 * Invisible Sun — what a pool takes off an action
 *
 * The two things a pool brings are easy to confuse and behave nothing alike: a
 * scourge stands and is never spent, a vex is consumed and only when the GM
 * says so. The cases below are the ones that would let one quietly behave like
 * the other.
 *
 * This rule was a pair of statics on ChallengeCard and could not be reached
 * from the dialog a player opens for themselves, which is how a scourged
 * Sorcery pool came to cost a caster nothing.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

import { stubFoundry, unstubFoundry } from "./foundry-stub.mjs";
import * as pools from "../../module/helpers/pools.mjs";

/* groupOf reads the pool names out of CONFIG.ISUN, so the real config has to be
 * in place — a fake list would be testing the fake. */
before(() => stubFoundry());
after(() => unstubFoundry());

/** A vislae with one pool in whatever state the case needs. */
function vislae(key, { value = 0, vex = 0, scourgeTotal = 0 } = {}) {
  const group = ["accuracy", "movement", "physicality", "perception"].includes(key)
    ? "certes" : "qualia";
  return { system: { stats: { [group]: { pools: { [key]: { value, vex, scourgeTotal } } } } } };
}

describe("which stat a pool belongs to", () => {

  test("the four Certes pools and the four Qualia ones", () => {
    for (const key of ["accuracy", "movement", "physicality", "perception"]) {
      assert.equal(pools.groupOf(key), "certes", key);
    }
    for (const key of ["sorcery", "interaction", "intellect", "sortilege"]) {
      assert.equal(pools.groupOf(key), "qualia", key);
    }
  });

  test("a name that is neither is null, not a guess", () => {
    /* This used to fall through to "qualia", which reads Sorcery's scourge off
     * a pool called "sorcary" and reports it as real. Better to find nothing. */
    assert.equal(pools.groupOf("sorcary"), null);
    assert.equal(pools.groupOf(""), null);
    assert.equal(pools.groupOf(undefined), null);
  });
});

describe("finding a pool to write back to", () => {

  test("the path is the one an update takes", () => {
    const found = pools.find(vislae("sorcery", { value: 4 }), "sorcery");
    assert.equal(found.path, "system.stats.qualia.pools.sorcery");
    assert.equal(found.group, "qualia");
    assert.equal(found.pool.value, 4);
  });

  test("null for a pool the character has not got", () => {
    assert.equal(pools.find(vislae("sorcery"), "movement"), null);
    assert.equal(pools.find(null, "sorcery"), null);
  });
});

describe("what the pool takes off the venture", () => {

  test("a scourge comes back whole, whatever the ceiling", () => {
    // "subtract 1 from your venture for every action drawing on this pool"
    // (The Key, p2242). It is not spent, so no ceiling applies to it.
    const cost = pools.costOf(vislae("sorcery", { scourgeTotal: 2 }), "sorcery");
    assert.equal(cost.scourge, 2);
  });

  test("scourgeTotal is read, not scourge", () => {
    /* A pool carries scourges from four scopes — its own, all-Certes,
     * all-Qualia, and those derived from Wounds and Anguish. ISUNActor sums
     * them into scourgeTotal, and reading the raw field would silently drop
     * three of the four. */
    const actor = vislae("sorcery", { scourgeTotal: 3 });
    actor.system.stats.qualia.pools.sorcery.scourge = 1;
    assert.equal(pools.costOf(actor, "sorcery").scourge, 3);
  });

  test("no vex applies until a ceiling asks for one", () => {
    // The GM decides when, so the default is that they have not.
    assert.equal(pools.costOf(vislae("sorcery", { vex: 3 }), "sorcery").vex, 0);
  });

  test("the ceiling is a ceiling, not a count", () => {
    // A GM saying "spend two" against a pool holding one gets one. There is no
    // such thing as owing a vex.
    assert.equal(pools.costOf(vislae("sorcery", { vex: 1 }), "sorcery", { maxVex: 2 }).vex, 1);
    assert.equal(pools.costOf(vislae("sorcery", { vex: 4 }), "sorcery", { maxVex: 2 }).vex, 2);
    assert.equal(pools.costOf(vislae("sorcery", { vex: 0 }), "sorcery", { maxVex: 2 }).vex, 0);
  });

  test("a negative ceiling cannot hand a vex back", () => {
    assert.equal(pools.costOf(vislae("sorcery", { vex: 3 }), "sorcery", { maxVex: -2 }).vex, 0);
  });

  test("the bene reported is what the pool holds", () => {
    assert.equal(pools.costOf(vislae("sorcery", { value: 5 }), "sorcery").bene, 5);
  });

  test("all three are zero for a pool that is not there", () => {
    // Not an error: an action may name a pool the character has no points in.
    assert.deepEqual(pools.costOf(vislae("sorcery"), "nonsense", { maxVex: 3 }),
      { scourge: 0, vex: 0, bene: 0 });
  });

  test("a scourge and a vex are both taken, and are not the same thing", () => {
    const cost = pools.costOf(vislae("sorcery", { value: 6, vex: 2, scourgeTotal: 1 }),
      "sorcery", { maxVex: 1 });
    assert.deepEqual(cost, { scourge: 1, vex: 1, bene: 6 },
      "the scourge ignores the ceiling that clamps the vex");
  });
});

describe("how many bene one action may be paid with", () => {

  /* "Any character can add 1 to the venture of a magical action by spending 1
   * bene" (The Way, p8), and two secrets raise that. The cap is on the action,
   * so it does not matter how many pools are in front of the player or how much
   * each of them holds. */

  const withSecrets = (...names) => ({
    items: names.map(name => ({ type: "Secret", name }))
  });

  test("one, for a character who has bought nothing", () => {
    assert.equal(pools.beneCap(withSecrets()), 1);
    assert.equal(pools.beneCap(null), 1);
  });

  test("three with Expansive Endeavor", () => {
    // "up to 3 bene … rather than just 1" (The Way, p88).
    assert.equal(pools.beneCap(withSecrets("Expansive Endeavor")), 3);
  });

  test("ten with Magnificent Endeavor", () => {
    // "up to 10 … rather than just 3" (The Way, p90).
    assert.equal(pools.beneCap(withSecrets("Magnificent Endeavor")), 10);
  });

  test("holding both is ten, not thirteen", () => {
    /* The second replaces the first — "rather than just 3, as allowed by
     * Expansive Endeavor" — and holding both is the normal case, since one is
     * the prerequisite of the other. */
    assert.equal(pools.beneCap(withSecrets("Expansive Endeavor", "Magnificent Endeavor")), 10);
    assert.equal(pools.beneCap(withSecrets("Magnificent Endeavor", "Expansive Endeavor")), 10);
  });

  test("matched however the name was cased or spaced", () => {
    assert.equal(pools.beneCap(withSecrets("  expansive endeavor ")), 3);
    assert.equal(pools.beneCap(withSecrets("EXPANSIVE ENDEAVOR")), 3);
  });

  test("an item of another type with the same name does not count", () => {
    // A spell called Expansive Endeavor is not the secret of that name.
    const actor = { items: [{ type: "Spell", name: "Expansive Endeavor" }] };
    assert.equal(pools.beneCap(actor), 1);
  });

  test("other secrets leave it alone", () => {
    assert.equal(pools.beneCap(withSecrets("Bleed Serpents", "Sudden Insight")), 1);
  });
});

describe("how many enhancements Sortilege may put on one action", () => {

  /* "You can add two enhancements from Sortilege to an action, or you can add
   * one enhancement from Sortilege to something that already has enhancements,
   * like a spell" (Advanced Sortilege, level 5). The secret names the baseline
   * by saying what it improves on. */

  const withSecrets = (...names) => ({ items: names.map(name => ({ type: "Secret", name })) });
  const ADVANCED = "Advanced Sortilege";

  test("one enhancement on an ordinary action", () => {
    assert.equal(pools.sortilegeCap(withSecrets()), 1);
    assert.equal(pools.sortilegeCap(null), 1);
  });

  test("none at all on something that already has enhancements", () => {
    // A spell brings its own dice, and Sortilege cannot be stacked onto it.
    assert.equal(pools.sortilegeCap(withSecrets(), { enhanced: true }), 0);
  });

  test("Advanced Sortilege makes it two, and one", () => {
    assert.equal(pools.sortilegeCap(withSecrets(ADVANCED)), 2);
    assert.equal(pools.sortilegeCap(withSecrets(ADVANCED), { enhanced: true }), 1);
  });

  test("matched however the name was cased", () => {
    assert.equal(pools.sortilegeCap(withSecrets("advanced SORTILEGE")), 2);
  });

  test("a different secret does not lift it", () => {
    assert.equal(pools.sortilegeCap(withSecrets("Expansive Endeavor")), 1);
  });

  test("an item of another type with that name does not count", () => {
    assert.equal(pools.sortilegeCap({ items: [{ type: "Spell", name: ADVANCED }] }), 1);
  });
});
