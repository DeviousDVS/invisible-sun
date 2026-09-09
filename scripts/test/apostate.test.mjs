/**
 * Invisible Sun — what an Apostate has, having no degrees to have it by
 *
 * Every other order answers "what am I entitled to?" with a number: the degree
 * held, and everything the rungs below it grant. An Apostate answers it with a
 * list of names, and these are the tests of reading that list.
 *
 * The fixture is the shape of the real Apostate order, not its whole text: a
 * starting package that is granted entire, and an open list that is not.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

import { stubFoundry, unstubFoundry } from "./foundry-stub.mjs";
import { abilitiesHeld, entitlements, cruxSpent, freeLeft, toggle }
  from "../../module/helpers/apostate.mjs";

const grants = (g = {}) => ({ ephemera: 0, incantations: 0, conation: 0, ...g });

/* The two lists as The Key prints them (p62), cut to the entries that carry an
 * entitlement plus enough plain ones to count with. */
const ORDER = {
  system: {
    startingAbilities: [
      { name: "Ephemera Use", grants: grants({ ephemera: 3 }) },
      { name: "Skill", grants: grants() },
      { name: "Counterspell", grants: grants() }
    ],
    apostateAbilities: [
      { name: "Extra Spells", grants: grants() },
      { name: "Street Magic", grants: grants() },
      { name: "Additional Ephemera", grants: grants({ ephemera: 4 }) },
      { name: "Incantation", grants: grants({ conation: 1 }) }
    ]
  }
};

before(() => stubFoundry());
after(() => unstubFoundry());

describe("what an Apostate holds", () => {

  test("the starting package is granted entire, chosen or not", () => {
    // "Apostates have no degrees, but all starting Apostate characters begin
    // with the following abilities" (The Key, p62). There is no choosing in it.
    assert.deepEqual(abilitiesHeld(ORDER, []).map(a => a.name),
      ["Ephemera Use", "Skill", "Counterspell"]);
  });

  test("the open list is only what has been taken", () => {
    assert.deepEqual(abilitiesHeld(ORDER, ["Incantation"]).map(a => a.name),
      ["Ephemera Use", "Skill", "Counterspell", "Incantation"]);
  });

  test("a name the order no longer offers is not held", () => {
    // The Order item is shared and may be re-imported or edited. A pick left
    // behind by that must stop counting rather than becoming a ghost ability.
    assert.deepEqual(abilitiesHeld(ORDER, ["Blood Sorcery"]).map(a => a.name),
      ["Ephemera Use", "Skill", "Counterspell"]);
  });
});

describe("what those abilities entitle them to", () => {

  test("the starting package reaches the limits on its own", () => {
    // The bug this closes: an Apostate has no degree, so nothing was reading
    // "Ephemera Use: we can safely possess three ephemera" at all.
    assert.equal(entitlements(ORDER, []).ephemera, 3);
  });

  test("an ability bought later reaches them too", () => {
    assert.equal(entitlements(ORDER, []).conation, 0, "not until it is taken");
    assert.equal(entitlements(ORDER, ["Incantation"]).conation, 1);
  });

  test("the largest wins, because each states a total", () => {
    // "Additional Ephemera: the maximum number of ephemera we can possess at
    // one time increases by 1" — recorded as the total of 4, not as +1, so
    // taking it must not add to the 3 the starting package already gives.
    assert.equal(entitlements(ORDER, ["Additional Ephemera"]).ephemera, 4);
  });
});

describe("what the list costs", () => {

  test("the first two are free", () => {
    // "We gain two selections from the list of abilities" (The Key, p62).
    assert.equal(cruxSpent([]), 0);
    assert.equal(cruxSpent(["Extra Spells"]), 0);
    assert.equal(cruxSpent(["Extra Spells", "Street Magic"]), 0);
  });

  test("every one after costs a Crux", () => {
    assert.equal(cruxSpent(["Extra Spells", "Street Magic", "Incantation"]), 1);
    assert.equal(cruxSpent(["a", "b", "c", "d", "e"]), 3);
  });

  test("the free picks still to make are counted down, never up", () => {
    assert.equal(freeLeft([]), 2);
    assert.equal(freeLeft(["Extra Spells"]), 1);
    assert.equal(freeLeft(["Extra Spells", "Street Magic", "Incantation"]), 0);
  });
});

describe("taking one, and giving it up", () => {

  test("taking adds it, and taking again gives it up", () => {
    const one = toggle(ORDER, [], "Street Magic");
    assert.deepEqual(one, ["Street Magic"]);
    assert.deepEqual(toggle(ORDER, one, "Street Magic"), []);
  });

  test("an ability the order does not offer cannot be taken", () => {
    // Otherwise a typo, or a stale name from a dialog, lands in the record and
    // goes on costing Crux with no row on the sheet to clear it from.
    assert.deepEqual(toggle(ORDER, ["Street Magic"], "Blood Sorcery"), ["Street Magic"]);
  });

  test("the list handed in is not modified", () => {
    const taken = ["Street Magic"];
    toggle(ORDER, taken, "Incantation");
    assert.deepEqual(taken, ["Street Magic"]);
  });
});
