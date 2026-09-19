/**
 * Invisible Sun — how far a character may go in a round
 *
 * "A character can use their entire action to run a short distance or they can
 * move a close distance and cast a spell" (The Gate, p26). Two ways to be wrong
 * about that, and the cases here are both: a move that should have cost the
 * action being waved through, and a budget counted per drag rather than per
 * round, which is the same mistake three times over.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

import { stubFoundry, unstubFoundry } from "./foundry-stub.mjs";
import { reach, judgeMove, totalFor } from "../../module/helpers/movement.mjs";

before(() => stubFoundry());
after(() => unstubFoundry());

describe("what a round allows", () => {

  test("close for free, near for the action", () => {
    assert.deepEqual(reach("ft"), { free: 10, most: 50 });
  });

  /* The same table the canvas rings are drawn from. A rule enforcing one set of
   * distances while the overlay drew another would be unarguable at the table. */
  test("and the book's own metres, not those converted", () => {
    assert.deepEqual(reach("m"), { free: 3, most: 15 });
  });
});

describe("what a move costs", () => {

  test("a step is part of whatever else you do", () => {
    assert.equal(judgeMove(0, "ft"), "free");
    assert.equal(judgeMove(9, "ft"), "free");
  });

  /* Boundaries belong to the band that names them, as everywhere else in the
   * books: "a distance of 10 to 50 feet" makes exactly 10 close. */
  test("exactly close is still close", () => {
    assert.equal(judgeMove(10, "ft"), "free");
  });

  test("past close is the whole action", () => {
    assert.equal(judgeMove(11, "ft"), "spends");
    assert.equal(judgeMove(49, "ft"), "spends");
  });

  /* And exactly near is the action rather than a refusal for overshooting by
   * nothing at all. */
  test("exactly near is the action, not a refusal", () => {
    assert.equal(judgeMove(50, "ft"), "spends");
  });

  test("past near is not one round's worth", () => {
    assert.equal(judgeMove(51, "ft"), "beyond");
    assert.equal(judgeMove(500, "ft"), "beyond");
  });

  test("metres answer off their own table", () => {
    assert.equal(judgeMove(3, "m"), "free");
    assert.equal(judgeMove(4, "m"), "spends");
    assert.equal(judgeMove(15, "m"), "spends");
    assert.equal(judgeMove(16, "m"), "beyond");
  });

  test("a distance that is not one is not a refusal", () => {
    // Nothing measurable means nothing spent; refusing would strand a token.
    assert.equal(judgeMove(NaN, "ft"), "free");
    assert.equal(judgeMove(undefined, "ft"), "free");
  });
});

describe("how far this move takes them in total", () => {

  /* The budget is the round's, not the drag's. Three ten-foot steps is a near
   * move and costs the action; counting each on its own would make it three
   * free ones, which is the whole of what this guards. */
  test("what has been walked plus what is about to be", () => {
    assert.equal(totalFor({
      history: { distance: 20 }, passed: { distance: 8 }, pending: { distance: 4 }
    }), 32);
  });

  test("a first move has no history behind it", () => {
    assert.equal(totalFor({ passed: { distance: 8 }, pending: { distance: 0 } }), 8);
  });

  test("a movement that measures nothing is nought, not NaN", () => {
    assert.equal(totalFor({}), 0);
    assert.equal(totalFor(null), 0);
    assert.equal(totalFor({ history: {}, passed: {}, pending: {} }), 0);
  });
});
