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
import { abilitiesHeld, takenAbilities, available, entitlements,
         costOf, cruxSpent, freeLeft, add, drop }
  from "../../module/helpers/apostate.mjs";

const grants = (g = {}) => ({ ephemera: 0, incantations: 0, conation: 0, ...g });

/** A pick, as the character sheet stores one: what was taken and what it cost. */
const pick = (name, crux = 0) => ({ name, crux });

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
    assert.deepEqual(abilitiesHeld(ORDER, [pick("Incantation")]).map(a => a.name),
      ["Ephemera Use", "Skill", "Counterspell", "Incantation"]);
  });

  test("a name the order no longer offers is not held", () => {
    // The Order item is shared and may be re-imported or edited. A pick left
    // behind by that must stop counting rather than becoming a ghost ability.
    assert.deepEqual(abilitiesHeld(ORDER, [pick("Blood Sorcery")]).map(a => a.name),
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
    assert.equal(entitlements(ORDER, [pick("Incantation")]).conation, 1);
  });

  test("the largest wins, because each states a total", () => {
    // "Additional Ephemera: the maximum number of ephemera we can possess at
    // one time increases by 1" — recorded as the total of 4, not as +1, so
    // taking it must not add to the 3 the starting package already gives.
    assert.equal(entitlements(ORDER, [pick("Additional Ephemera")]).ephemera, 4);
  });
});

describe("what the list costs", () => {

  test("the first two are free, and the rest are not", () => {
    // "We gain two selections from the list of abilities" at creation, and
    // "once an Apostate begins play, we can select a new ability… for a cost of
    // 1 Crux" after (The Key, p62).
    assert.equal(costOf([]), 0);
    assert.equal(costOf([pick("Extra Spells")]), 0);
    assert.equal(costOf([pick("Extra Spells"), pick("Street Magic")]), 1);
  });

  test("the free picks still to make are counted down, never up", () => {
    assert.equal(freeLeft([]), 2);
    assert.equal(freeLeft([pick("Extra Spells")]), 1);
    assert.equal(freeLeft([pick("a"), pick("b"), pick("c")]), 0);
  });

  test("what has been spent is what was paid, not what it would cost now", () => {
    // The distinction the record exists for. A character written up with five
    // abilities already has spent nothing at this table; a total worked out
    // from the count would charge them three Crux they never paid.
    assert.equal(cruxSpent([pick("a"), pick("b"), pick("c"), pick("d"), pick("e")]), 0);
    assert.equal(cruxSpent([pick("a"), pick("b"), pick("c", 1)]), 1);
    assert.equal(cruxSpent([pick("a", 1), pick("b", 2)]), 3, "a house price is honoured too");
  });
});

describe("taking one, and giving it up", () => {

  test("taking records the name and the price", () => {
    assert.deepEqual(add(ORDER, [], "Street Magic", 0), [{ name: "Street Magic", crux: 0 }]);
    assert.deepEqual(add(ORDER, [pick("Street Magic")], "Incantation", 1),
      [{ name: "Street Magic", crux: 0 }, { name: "Incantation", crux: 1 }]);
  });

  test("an ability the order does not offer cannot be taken", () => {
    // Otherwise a typo, or a stale name from a re-imported order, lands in the
    // record with no row on the sheet to clear it from.
    assert.deepEqual(add(ORDER, [pick("Street Magic")], "Blood Sorcery", 1),
      [{ name: "Street Magic", crux: 0 }]);
  });

  test("one already held is not taken twice", () => {
    // The picker refuses it too, but a double-click must not be able to charge
    // a second Crux for the same line.
    const once = add(ORDER, [], "Street Magic", 0);
    assert.deepEqual(add(ORDER, once, "Street Magic", 1), once);
  });

  test("giving one up removes it and leaves the rest alone", () => {
    const two = [pick("Street Magic"), pick("Incantation", 1)];
    assert.deepEqual(drop(two, "Street Magic"), [{ name: "Incantation", crux: 1 }]);
  });

  test("the list handed in is not modified", () => {
    const taken = [pick("Street Magic")];
    add(ORDER, taken, "Incantation", 1);
    drop(taken, "Street Magic");
    assert.deepEqual(taken, [{ name: "Street Magic", crux: 0 }]);
  });
});

describe("what the sheet and the picker are each shown", () => {

  test("the panel lists what is held, in the book's order, with its price", () => {
    // Driven off the order's list rather than off the picks, so the sheet reads
    // down the page the way the book prints it however they were taken.
    const taken = [pick("Incantation", 1), pick("Street Magic")];
    assert.deepEqual(takenAbilities(ORDER, taken),
      [{ name: "Street Magic", grants: grants(), crux: 0 },
       { name: "Incantation", grants: grants({ conation: 1 }), crux: 1 }]);
  });

  test("the picker is offered what is not held", () => {
    assert.deepEqual(available(ORDER, [pick("Street Magic")]).map(a => a.name),
      ["Extra Spells", "Additional Ephemera", "Incantation"]);
  });
});
