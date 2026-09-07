/**
 * Invisible Sun — when an ongoing effect is checked
 *
 * "It is the responsibility of the player to keep track of spells they cast and
 * ongoing effects that require depletion rolls, and to make those rolls…  If a
 * player loses track of this information, ongoing spells are assumed to have
 * depleted" (The Way, p11).
 *
 * The tracker exists to carry that. Grouping is the whole of what makes it
 * usable — "what do I roll at the end of my turn" has an answer and "your
 * depletions" does not — so the rule that reads the moment out of a card is
 * worth holding to the strings the cards actually print. Every one quoted below
 * is from the packs.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

import { stubFoundry, unstubFoundry } from "./foundry-stub.mjs";
import { depletionCadence, depletionMoment } from "../../module/helpers/practice.mjs";

before(() => stubFoundry());
after(() => unstubFoundry());

describe("which moment a depletion names", () => {

  test("the four the books use for all but a handful", () => {
    // 168 entries check each round, 106 each hour, 80 each use, 15 each day.
    assert.equal(depletionCadence("0 (check each round)"), "round");
    assert.equal(depletionCadence("0–4 (check each hour)"), "hour");
    assert.equal(depletionCadence("0–1 (check each use)"), "use");
    assert.equal(depletionCadence("0–2 (check each day)"), "day");
  });

  test("a combat that mentions being used is a combat", () => {
    // "check at the end of each combat in which it is used" — the trap the
    // order exists for. Tried after `use`, this reads as a per-use depletion
    // and lands in the wrong group on the board.
    assert.equal(depletionCadence("0–3 (check at the end of each combat in which it is used)"),
      "combat");
    assert.equal(depletionCadence("0–1 (check at the end of each combat encounter)"), "combat");
  });

  test("a use that mentions a day is a use", () => {
    // "check each use, but never more than once each day" — the same trap the
    // other way about. Tried after `day`, a per-use depletion becomes daily and
    // is rolled a great deal less often than the card says.
    assert.equal(depletionCadence("0–1 (check each use, but never more than once each day)"), "use");
    assert.equal(depletionCadence("0 (check each use, but don't check more than once between sunrises)"),
      "use");
  });

  test("an activation is a use", () => {
    assert.equal(depletionCadence("0–2 (check each activation)"), "use");
    assert.equal(depletionCadence("0 (check each activation as well as each hour worn continuously)"),
      "use");
  });

  test("a moment written once in the whole of the books is its own thing", () => {
    // About forty are like this. Bucketing them by whichever word happened to
    // match would say something the card does not, so they group together and
    // the row prints the sentence instead.
    for (const one of ["0–2 (check each time the boots prevent a step)",
                       "0 (check each bird created)",
                       "0–1 (check each Wound use)",
                       "0 (check each question)"]) {
      const cadence = depletionCadence(one);
      assert.ok(["event", "use"].includes(cadence), `${one} → ${cadence}`);
    }
    assert.equal(depletionCadence("0 (check each bird created)"), "event");
  });

  test("nothing at all for a depletion that is never rolled", () => {
    // 176 of the 541 end on a sunrise, a sunset or a condition. There is no
    // moment to name because there is no roll to time.
    assert.equal(depletionCadence("When all snakes have made an attack"), "");
    assert.equal(depletionCadence("Ends automatically when you suffer 5 points of cold damage"), "");
    assert.equal(depletionCadence(""), "");
    assert.equal(depletionCadence(null), "");
  });

  test("every cadence the table can produce has something to call it", () => {
    // The board prints a heading per group. One without a label would head a
    // column with its own key.
    const labels = CONFIG.ISUN.depletionCadenceLabels;
    for (const { key } of CONFIG.ISUN.depletionCadences) {
      assert.ok(labels[key], `${key} has no label`);
    }
    assert.ok(labels.event, "the fall-through has no label");
  });
});

describe("what the card says about when", () => {

  test("the bracket, when there is one", () => {
    assert.equal(depletionMoment("0–2 (check each time the boots prevent a step)"),
      "check each time the boots prevent a step");
    assert.equal(depletionMoment("0 (check each round)"), "check each round");
  });

  test("whatever follows the number, when there is not", () => {
    assert.equal(depletionMoment("0–1 check each use"), "check each use");
  });

  test("the whole of it, when it opens with no number", () => {
    // Not rolled, so it never reaches the board — but the reader should not
    // silently eat the sentence if it ever does.
    assert.equal(depletionMoment("When all snakes have made an attack"),
      "When all snakes have made an attack");
  });

  test("nothing for nothing", () => {
    assert.equal(depletionMoment(""), "");
    assert.equal(depletionMoment(null), "");
  });
});
