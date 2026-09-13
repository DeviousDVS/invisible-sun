/**
 * Invisible Sun — a round is a checklist, not a running order
 *
 * The cases here are the ones that would let a round quietly behave like a turn
 * order: a stamp counting in a round it does not belong to, a combatant nobody
 * can see holding the round open, a list that reshuffles itself as people act.
 *
 * None of it touches Foundry. The rules take plain rows, which is the whole
 * reason they are in a helper rather than on the Combat document.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { sideOf, hasActed, canAct, canTakeFloor, counted, tally, roundComplete,
         orderRows, PLAYERS, OPPOSITION }
  from "../../module/helpers/action-round.mjs";

/** A row, as much of one as these rules ever look at. */
const row = (name, extra = {}) => ({
  id: name.toLowerCase(), name, side: OPPOSITION,
  hidden: false, defeated: false, actedIn: null, ...extra
});

const pc = (name, extra = {}) => row(name, { side: PLAYERS, ...extra });

describe("which side of the table a row sits on", () => {

  test("a Vislae is one of the players", () => {
    assert.equal(sideOf("Vislae"), PLAYERS);
  });

  test("an NPC and a creature are what they are facing", () => {
    assert.equal(sideOf("NPC"), OPPOSITION);
    assert.equal(sideOf("Creature"), OPPOSITION);
  });

  /* The derivation is a guess, and it is wrong for every allied NPC the GM
   * hands to a player. The override is how a GM says so. */
  test("an override beats the type", () => {
    assert.equal(sideOf("NPC", PLAYERS), PLAYERS);
    assert.equal(sideOf("Vislae", OPPOSITION), OPPOSITION);
  });

  test("an override that is not a side is ignored rather than obeyed", () => {
    assert.equal(sideOf("Vislae", "neither"), PLAYERS);
    assert.equal(sideOf("NPC", ""), OPPOSITION);
    assert.equal(sideOf("NPC", null), OPPOSITION);
  });
});

describe("whether someone has already acted", () => {

  test("a stamp from the round happening now", () => {
    assert.equal(hasActed(row("Vaquith", { actedIn: 3 }), 3), true);
  });

  test("a stamp from an earlier round does not carry over", () => {
    assert.equal(hasActed(row("Vaquith", { actedIn: 2 }), 3), false);
  });

  /* The state a GM reaches by pressing previous round. The stamp is still 5;
   * round 4 is not the round it records. */
  test("nor does one from a round the table has stepped back out of", () => {
    assert.equal(hasActed(row("Vaquith", { actedIn: 5 }), 4), false);
  });

  test("somebody who has not acted at all", () => {
    assert.equal(hasActed(row("Vaquith"), 3), false);
    assert.equal(hasActed(row("Vaquith", { actedIn: undefined }), 3), false);
  });

  test("an encounter that has not started is a round nobody has acted in", () => {
    assert.equal(hasActed(row("Vaquith", { actedIn: 0 }), 0), false);
  });

  test("a row that is not there is not an error", () => {
    assert.equal(hasActed(null, 3), false);
    assert.equal(hasActed(undefined, 3), false);
  });

  /* The argument for storing the round rather than a tick. A GM who advances
   * the round by accident presses previous, and the round they were in is
   * still the round they were in — every stamp reading 5 records a round 5
   * that is happening again. A boolean cleared on the way forward is gone. */
  test("stepping forward by accident and back again loses nothing", () => {
    const acted = row("Vaquith", { actedIn: 5 });
    assert.equal(hasActed(acted, 5), true);
    assert.equal(hasActed(acted, 6), false);
    assert.equal(hasActed(acted, 5), true);
  });
});

describe("who can still act", () => {

  test("anyone who has not", () => {
    assert.equal(canAct(row("Vaquith"), 3), true);
  });

  test("and not twice", () => {
    assert.equal(canAct(row("Vaquith", { actedIn: 3 }), 3), false);
  });

  test("the defeated get no action", () => {
    assert.equal(canAct(row("Vaquith", { defeated: true }), 3), false);
  });

  /* Hidden bars nothing. A creature the players have not seen yet still acts
   * and the GM still narrates it — being unseen is about the tally, not about
   * whether there is an action to take. */
  test("one the players cannot see still acts", () => {
    assert.equal(canAct(row("Mori Gra", { hidden: true }), 3), true);
  });
});

describe("taking the floor", () => {

  test("anyone who can act may, while it is free", () => {
    assert.equal(canTakeFloor(row("Vaquith"), 3, null), true);
    assert.equal(canTakeFloor(row("Vaquith"), 3, ""), true);
    assert.equal(canTakeFloor(row("Vaquith"), 3, undefined), true);
  });

  /* Not taken from the one holding it. They are mid-sentence, and the GM's way
   * of moving it is to take it back first — which is a separate act, and reads
   * as one at the table. */
  test("nobody takes it from whoever is holding it", () => {
    assert.equal(canTakeFloor(row("Vaquith"), 3, "accursed-cube"), false);
  });

  test("not even the one already holding it", () => {
    const holder = row("Vaquith");
    assert.equal(canTakeFloor(holder, 3, holder.id), false);
  });

  test("nor anyone who has acted or is defeated", () => {
    assert.equal(canTakeFloor(row("Vaquith", { actedIn: 3 }), 3, null), false);
    assert.equal(canTakeFloor(row("Vaquith", { defeated: true }), 3, null), false);
  });
});

describe("who the round is waiting on", () => {

  test("everyone the table can see who is still in the fight", () => {
    assert.equal(counted(row("Vaquith")), true);
    assert.equal(counted(row("Vaquith", { actedIn: 3 })), true);
  });

  /* Two exclusions for two reasons. A body on the floor is still a thing in
   * the scene and stays listed, but a round cannot be waiting on one. */
  test("not one that has been put down", () => {
    assert.equal(counted(row("Vaquith", { defeated: true })), false);
  });

  /* And a combatant the players cannot see is not in their tally — the
   * alternative is the players reading "3 of 4" against a GM reading "4 of 5"
   * with nobody able to say why the round will not end. */
  test("and not one the players cannot see", () => {
    assert.equal(counted(row("Mori Gra", { hidden: true })), false);
  });

  test("a row that is not there is not an error", () => {
    assert.equal(counted(null), false);
    assert.equal(counted(undefined), false);
  });
});

describe("how far through the round the table is", () => {

  test("counted against everyone who is due an action", () => {
    const rows = [pc("Talyactris", { actedIn: 3 }), pc("Coreval"), row("Vaquith")];
    assert.deepEqual(tally(rows, 3), { done: 1, total: 3 });
  });

  /* The reason hidden sits outside the count: otherwise the players read
   * "3 of 4" while the GM reads "4 of 5" and nobody can say why the round
   * will not end. Out of both halves, for both of them. */
  test("one the players cannot see is in neither half", () => {
    const rows = [pc("Coreval", { actedIn: 3 }), row("Mori Gra", { hidden: true })];
    assert.deepEqual(tally(rows, 3), { done: 1, total: 1 });
  });

  test("and one who cannot act is in neither half either", () => {
    const rows = [pc("Coreval", { actedIn: 3 }),
                  row("Vaquith", { defeated: true, actedIn: 3 })];
    assert.deepEqual(tally(rows, 3), { done: 1, total: 1 });
  });

  test("a round nobody has got to yet", () => {
    assert.deepEqual(tally([pc("Coreval"), row("Vaquith")], 3), { done: 0, total: 2 });
  });

  test("an empty list is not a division by zero", () => {
    assert.deepEqual(tally([], 3), { done: 0, total: 0 });
    assert.deepEqual(tally(), { done: 0, total: 0 });
  });
});

describe("whether the round is over", () => {

  test("once everyone due an action has taken it", () => {
    const rows = [pc("Coreval", { actedIn: 3 }), row("Vaquith", { actedIn: 3 })];
    assert.equal(roundComplete(rows, 3), true);
  });

  test("and not while one of them has not", () => {
    const rows = [pc("Coreval", { actedIn: 3 }), row("Vaquith")];
    assert.equal(roundComplete(rows, 3), false);
  });

  test("an unrevealed creature does not hold it open", () => {
    const rows = [pc("Coreval", { actedIn: 3 }), row("Mori Gra", { hidden: true })];
    assert.equal(roundComplete(rows, 3), true);
  });

  test("nor does one that has been put down", () => {
    const rows = [pc("Coreval", { actedIn: 3 }), row("Vaquith", { defeated: true })];
    assert.equal(roundComplete(rows, 3), true);
  });

  /* What a fight looks like when the last one standing goes down. The answer
   * wanted there is Action Mode ending, not another round beginning, so an
   * empty tally is not a finished round. */
  test("nobody left to act is not a round that finished", () => {
    assert.equal(roundComplete([row("Vaquith", { defeated: true })], 3), false);
    assert.equal(roundComplete([], 3), false);
  });
});

describe("the order the list reads in", () => {

  test("the players first, then what they are facing", () => {
    const rows = orderRows([row("Vaquith"), pc("Coreval"), row("Abdominous"), pc("Talyactris")]);
    assert.deepEqual(rows.map(r => r.name),
      ["Coreval", "Talyactris", "Abdominous", "Vaquith"]);
  });

  test("by name inside a side", () => {
    const rows = orderRows([row("Vaquith"), row("Abdominous"), row("Mori Gra")]);
    assert.deepEqual(rows.map(r => r.name), ["Abdominous", "Mori Gra", "Vaquith"]);
  });

  /* Two out of the same stat block share a name, and a list that swapped them
   * between renders would move the row under the cursor of whoever was about
   * to click it. */
  test("two of the same name keep their places", () => {
    const rows = orderRows([
      { id: "b", name: "Vaquith", side: OPPOSITION },
      { id: "a", name: "Vaquith", side: OPPOSITION }
    ]);
    assert.deepEqual(rows.map(r => r.id), ["a", "b"]);
  });

  /* The list is not a queue. Acting ticks a row where it stands rather than
   * moving it, because a list that reordered itself under the reader would
   * make working down it a hunt after every choice. */
  test("acting does not move anybody", () => {
    const before = orderRows([row("Vaquith"), pc("Coreval")]).map(r => r.name);
    const after = orderRows([row("Vaquith", { actedIn: 3 }), pc("Coreval")]).map(r => r.name);
    assert.deepEqual(after, before);
  });

  test("the list handed in is left as it was", () => {
    const rows = [row("Vaquith"), pc("Coreval")];
    orderRows(rows);
    assert.deepEqual(rows.map(r => r.name), ["Vaquith", "Coreval"]);
  });

  test("nothing at all is not a crash", () => {
    assert.deepEqual(orderRows(), []);
    assert.deepEqual(orderRows([]), []);
  });
});
