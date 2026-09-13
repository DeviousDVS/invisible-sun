/**
 * Invisible Sun — what a target makes an action worth
 *
 * "Trying to pick a level 5 lock? Challenge 5" (The Gate, p18). The cases here
 * are the ones that would let that helpfulness lie: a level read off something
 * that has none, a challenge of nought that looks like a decision, and a group
 * whose hardest member is not the one the number came from.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { levelOf, targetRow, challengeFrom, currentTargets, challengeForTargets }
  from "../../module/helpers/target.mjs";

/** A creature, as much of one as these rules ever look at. */
const creature = (name, level, { effective, defenses = [], type = "Creature" } = {}) => ({
  type, name,
  system: {
    level, defenses,
    health: effective === undefined ? {} : { effectiveLevel: effective }
  }
});

describe("the level a challenge is reckoned from", () => {

  test("a creature's own", () => {
    assert.equal(levelOf(creature("Vaquith", 5)), 5);
  });

  /* "If an NPC gains a bene or a vex, this is a +1 bonus or -1 penalty to the
   * NPC's level" (The Gate, p1972). A scourged creature is easier to affect,
   * and the number offered should be the one true now. */
  test("the effective one wins over the printed one", () => {
    assert.equal(levelOf(creature("Vaquith", 5, { effective: 3 })), 3);
  });

  test("even when that has been ground down to nothing", () => {
    assert.equal(levelOf(creature("Vaquith", 5, { effective: 0 })), 0);
  });

  /* Levels belong to the world the characters act on, not to the characters. */
  test("a vislae has none", () => {
    assert.equal(levelOf(creature("Talyactris", 4, { type: "Vislae" })), null);
  });

  test("nor has something with no level recorded", () => {
    assert.equal(levelOf({ type: "NPC", name: "?", system: {} }), null);
    assert.equal(levelOf(null), null);
    assert.equal(levelOf(undefined), null);
  });
});

describe("reading a target", () => {

  test("its name, its level and what it is printed to resist", () => {
    const row = targetRow(creature("Vaquith", 5, {
      defenses: [{ kind: "", text: "Magic (two successes); +3 Dodge" }]
    }));
    assert.deepEqual(row, {
      name: "Vaquith", level: 5,
      defences: [{ kind: "", text: "Magic (two successes); +3 Dodge" }]
    });
  });

  test("both profiles, where an entry prints two", () => {
    const row = targetRow(creature("Mori Gra", 6, {
      defenses: [
        { kind: "Spiritual", text: "immune to physical attacks" },
        { kind: "Physical", text: "+2 to all defenses" }
      ]
    }));
    assert.deepEqual(row.defences.map(d => d.kind), ["Spiritual", "Physical"]);
  });

  test("an empty defence line is not carried", () => {
    const row = targetRow(creature("Vaquith", 5, { defenses: [{ kind: "Physical", text: "" }] }));
    assert.deepEqual(row.defences, []);
  });

  test("something with no level is not a target these rules can read", () => {
    assert.equal(targetRow(creature("Talyactris", 4, { type: "Vislae" })), null);
  });
});

describe("the challenge a set of targets sets", () => {

  test("one target, its level", () => {
    const found = challengeFrom([targetRow(creature("Vaquith", 5))]);
    assert.equal(found.challenge, 5);
    assert.equal(found.name, "Vaquith");
    assert.equal(found.others, 0);
  });

  /* One action against a group is as hard as the hardest thing in it. A player
   * who targeted three and was handed the easiest would be rolling against a
   * number nothing in front of them answers to. */
  test("several targets, the hardest of them", () => {
    const found = challengeFrom([
      targetRow(creature("Abdominous", 3)),
      targetRow(creature("Mori Gra", 8)),
      targetRow(creature("Vaquith", 5))
    ]);
    assert.equal(found.challenge, 8);
    assert.equal(found.name, "Mori Gra");
    assert.equal(found.others, 2);
  });

  test("and the defences reported are that one's", () => {
    const found = challengeFrom([
      targetRow(creature("Abdominous", 3, { defenses: [{ kind: "", text: "+1 Resist" }] })),
      targetRow(creature("Mori Gra", 8, { defenses: [{ kind: "", text: "+3 Dodge" }] }))
    ]);
    assert.deepEqual(found.defences, [{ kind: "", text: "+3 Dodge" }]);
  });

  test("a scourged creature is offered at what it is worth now", () => {
    const found = challengeFrom([
      targetRow(creature("Mori Gra", 8, { effective: 6 })),
      targetRow(creature("Vaquith", 7 ))
    ]);
    assert.equal(found.challenge, 7);
    assert.equal(found.name, "Vaquith");
  });

  /* Nothing rather than nought. A challenge of nought is a claim about the
   * action; a blank field is the absence of one, and the GM still names it. */
  test("targets that carry no level set no challenge", () => {
    assert.equal(challengeFrom([]), null);
    assert.equal(challengeFrom(), null);
    assert.equal(challengeFrom([null, undefined]), null);
  });

  test("a level of nought is still a level", () => {
    const found = challengeFrom([targetRow(creature("Husk", 0))]);
    assert.equal(found.challenge, 0);
  });
});

describe("what the player has targeted", () => {

  const user = (...actors) => ({ targets: new Set(actors.map(actor => ({ actor }))) });

  test("each targeted token's actor, as a row", () => {
    const rows = currentTargets(user(creature("Vaquith", 5), creature("Mori Gra", 8)));
    assert.deepEqual(rows.map(r => r.name), ["Vaquith", "Mori Gra"]);
  });

  test("passing over the ones that carry no level", () => {
    const rows = currentTargets(
      user(creature("Talyactris", 4, { type: "Vislae" }), creature("Vaquith", 5)));
    assert.deepEqual(rows.map(r => r.name), ["Vaquith"]);
  });

  test("targeting nothing is not an error", () => {
    assert.deepEqual(currentTargets({ targets: new Set() }), []);
    assert.deepEqual(currentTargets({}), []);
    assert.deepEqual(currentTargets(null), []);
  });

  test("and the whole of it in one call", () => {
    assert.equal(challengeForTargets(user(creature("Vaquith", 5))).challenge, 5);
    assert.equal(challengeForTargets({ targets: new Set() }), null);
  });
});
