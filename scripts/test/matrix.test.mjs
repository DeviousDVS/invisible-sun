/**
 * Invisible Sun — the Maker's Matrix
 *
 * The chart on The Way p62 is drawn rather than written, and the text extracted
 * out of the page arrives scrambled by its two columns — so every edge here was
 * read off the rendered diagram. That makes these tests the record of what the
 * diagram says, and the reason a later reading that disagrees fails loudly.
 *
 * Three cases carry more weight than the rest and are named for it: the book's
 * own worked example, which is the only place the text states the order of the
 * increment; and the two edges that are legible only from the drawing.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

import { stubFoundry, unstubFoundry } from "./foundry-stub.mjs";
import { craftLevel, daysFor, leavesFor, begin, step, advance, ended }
  from "../../module/helpers/matrix.mjs";

before(() => stubFoundry());
after(() => unstubFoundry());

/** Walk a process by handing it a scripted list of answers. */
const walk = (state, answers) => answers.reduce((s, a) => advance(s, a), state);

describe("what level the thing being made is", () => {

  test("the effect's level, modified by how long the magic lasts", () => {
    // "The effect dictates the level required… then modified by the kind of item
    // being made — specifically, how often it can be used before the magic
    // depletes" (The Way, p59).
    assert.equal(craftLevel({ effectLevel: 5, kind: "ephemera" }).level, 4);
    assert.equal(craftLevel({ effectLevel: 5, kind: "object0to4" }).level, 5);
    assert.equal(craftLevel({ effectLevel: 5, kind: "object0to2" }).level, 6);
    assert.equal(craftLevel({ effectLevel: 5, kind: "object0to1" }).level, 7);
    assert.equal(craftLevel({ effectLevel: 5, kind: "object0" }).level, 8);
    assert.equal(craftLevel({ effectLevel: 5, kind: "objectConstant" }).level, 9);
  });

  test("never below level 1", () => {
    // "(minimum, level 1)" — a level 1 effect made as a one-use ephemera would
    // otherwise be level 0, and there is no such thing to challenge against.
    assert.equal(craftLevel({ effectLevel: 1, kind: "ephemera" }).level, 1);
  });

  test("a side effect taken on purpose lowers the work, not the item", () => {
    // "A Maker could intentionally attempt to work a side effect into an item to
    // lower its in-process level. This is different from its final level, which
    // does not change" (The Way, p60). The distinction is the whole point: the
    // item is still worth what it is worth.
    const easy = craftLevel({ effectLevel: 6, kind: "object0to4", minor: 1, major: 1 });
    assert.equal(easy.level, 6, "the item is still a 6");
    assert.equal(easy.inProcess, 3, "but it is rolled for as a 3");
  });

  test("and cannot make the work easier than level 1", () => {
    const easy = craftLevel({ effectLevel: 2, kind: "object0to4", major: 2 });
    assert.equal(easy.inProcess, 1);
  });
});

describe("how long it takes", () => {

  test("two days a level, and a day for every failure", () => {
    // "the process takes two days per item level, plus one day for every
    // challenge failed" (The Way, p58).
    assert.equal(daysFor({ level: 4 }).days, 8);
    assert.equal(daysFor({ level: 4, failures: 3 }).days, 11);
  });

  test("hurrying is bought with harder challenges", () => {
    // "for every day shaved off the total, all challenges involved are 1 level
    // higher".
    const rushed = daysFor({ level: 4, shaved: 3 });
    assert.equal(rushed.days, 5);
    assert.equal(rushed.challengeBonus, 3);
  });

  test("the work cannot be hurried out of existence", () => {
    // Shaving more days than the process has is not a faster process; it is a
    // rule the book does not write. One day is the floor.
    const absurd = daysFor({ level: 2, shaved: 99 });
    assert.equal(absurd.days, 1);
    assert.equal(absurd.challengeBonus, 3, "and only the days actually shaved are paid for");
  });
});

describe("leaves in place of a component", () => {

  test("one, until the counts the book names", () => {
    // "Makers can substitute an appropriate emotion or concept leaf for an
    // ingredient, stabilizer, or catalyst of any level" — with counts given only
    // from level 6 up (The Way, p62).
    assert.equal(leavesFor(1), 1);
    assert.equal(leavesFor(5), 1);
    assert.equal(leavesFor(6), 2);
    assert.equal(leavesFor(7), 2);
    assert.equal(leavesFor(8), 5);
    assert.equal(leavesFor(9), 10);
    assert.equal(leavesFor(10), 15);
  });
});

describe("the book's own worked example", () => {

  test("challenge 1, a level 2 ingredient, then challenge 2", () => {
    // The load-bearing case. "Then comes the first of many challenges, always
    // starting at level 1… Success on the first challenge means that the Maker
    // adds a level 2 ingredient and then attempts another challenge, this time
    // level 2. If successful, they add a level 3 ingredient and attempt a level
    // 3 challenge" (The Way, p59).
    //
    // This is the only place the text fixes the order of the chart's
    // "(x now = x + 1)". Incrementing on the way out of a box instead of into
    // the next one gives a level 1 ingredient after the first challenge, and
    // every component and challenge in the process is then one too low.
    let s = begin({ level: 4 });
    assert.equal(step(s).componentLevel, 4, "the material matches the item");

    s = advance(s, "added");
    assert.equal(step(s).node, "challenge");
    assert.equal(step(s).challenge, 1, "always starting at level 1");

    s = advance(s, "success");
    assert.equal(step(s).node, "ingredient");
    assert.equal(step(s).componentLevel, 2, "a level 2 ingredient");

    s = advance(s, "added");
    s = advance(s, "yes");
    assert.equal(step(s).challenge, 2, "another challenge, this time level 2");

    s = advance(s, "success");
    assert.equal(step(s).componentLevel, 3, "a level 3 ingredient");

    s = advance(s, "added");
    s = advance(s, "yes");
    assert.equal(step(s).challenge, 3, "and a level 3 challenge");
  });
});

describe("finishing the work", () => {

  test("a clean run ends with the item", () => {
    // Four ingredients carry the working level to 4, then the power source and
    // one last challenge a level higher.
    let s = begin({ level: 4 });
    s = advance(s, "added");                       // material
    for (const answer of ["success", "added", "yes",
                          "success", "added", "yes",
                          "success", "added"]) s = advance(s, answer);
    // x is now 4, which is the target: saying no to Continue? takes the power
    // source branch rather than the random-effect one.
    s = advance(s, "no");
    assert.equal(step(s).node, "powerSource");
    assert.equal(step(s).componentLevel, 4);

    s = advance(s, "added");
    assert.equal(step(s).node, "finalChallenge");
    assert.equal(step(s).challenge, 5, "one level higher than the item");

    s = advance(s, "success");
    assert.equal(ended(s), "created");
  });

  test("stopping early gives an item nobody chose", () => {
    // "At any point in the process, the Maker can opt to quit. If they do so
    // after successfully adding an ingredient, they get an item with a random
    // effect" (The Way, p60).
    let s = walk(begin({ level: 6 }), ["added", "success", "added", "no"]);
    assert.equal(ended(s), "randomEffect");
  });

  test("failing the last challenge is a mishap, not another recovery", () => {
    // One of the two edges only the drawing settles. The arrow out of the final
    // challenge runs the width of the chart into Mishap; having added the power
    // source there is nothing left to recover with.
    let s = begin({ level: 1 });
    s = walk(s, ["added", "success", "added", "no", "added"]);
    assert.equal(step(s).node, "finalChallenge");
    assert.equal(ended(advance(s, "failure")), "mishap");
  });
});

describe("when a challenge is failed", () => {

  test("a catalyst, and a harder challenge for it", () => {
    // "Failures lead down a different path, where catalysts or even stabilizers
    // must be added to continue the process. Failures also increase the levels
    // of future challenges" (The Way, p60).
    let s = walk(begin({ level: 5 }), ["added", "failure"]);
    assert.equal(step(s).node, "catalyst");
    assert.equal(step(s).componentLevel, 2, "the working level has already climbed");

    s = advance(s, "added");
    assert.equal(step(s).node, "catalystChallenge");
    assert.equal(step(s).challenge, 3, "and the challenge is a level above that");
  });

  test("a minor side effect rejoins at Add Ingredient", () => {
    // The other edge only the drawing settles. Both side-effect boxes arrow back
    // up into Add Ingredient — which is what makes a catalyst a recovery rather
    // than a dead end, and matches "must be added to continue the process".
    let s = walk(begin({ level: 5 }), ["added", "failure", "added", "success"]);
    assert.equal(step(s).node, "minorSideEffect");
    assert.equal(step(s).inflicts, "minor", "and the box says how bad the flaw is");

    s = advance(s, "taken");
    assert.equal(step(s).node, "ingredient", "back into the main process");
    assert.deepEqual(s.sideEffects, [{ severity: "minor", text: "" }],
      "carrying the flaw it cost");
  });

  test("a major side effect rejoins there too", () => {
    let s = walk(begin({ level: 5 }),
      ["added", "failure", "added", "failure", "added", "success"]);
    assert.equal(step(s).node, "majorSideEffect");
    assert.equal(step(s).inflicts, "major");

    s = advance(s, "taken");
    assert.equal(step(s).node, "ingredient");
    assert.deepEqual(s.sideEffects, [{ severity: "major", text: "" }]);
  });

  test("the flaw keeps the words the table gave it", () => {
    // The chart says a flaw happens; the side-effect table says what it is. The
    // walk carries the second without knowing anything about it, which is what
    // lets the tables be imported later without this changing.
    let s = walk(begin({ level: 5 }), ["added", "failure", "added", "success"]);
    s = advance(s, "taken", "It hums audibly whenever it is used.");
    assert.deepEqual(s.sideEffects,
      [{ severity: "minor", text: "It hums audibly whenever it is used." }]);
  });

  test("a flaw with no table behind it is still a flaw", () => {
    // A world that has not imported The Way has no side-effect table to roll on.
    // The chart still says the item takes a flaw, so it takes one, with no words
    // to it — rather than the process quietly not counting it.
    let s = walk(begin({ level: 5 }), ["added", "failure", "added", "success"]);
    s = advance(s, "taken");
    assert.equal(s.sideEffects.length, 1);
    assert.equal(s.sideEffects[0].text, "");
  });

  test("failing the stabilizer's challenge is a mishap", () => {
    const s = walk(begin({ level: 5 }),
      ["added", "failure", "added", "failure", "added", "failure"]);
    assert.equal(ended(s), "mishap");
  });

  test("every failure is counted, because days are owed for them", () => {
    const s = walk(begin({ level: 5 }), ["added", "failure", "added", "failure"]);
    assert.equal(s.failures, 2);
    assert.equal(daysFor({ level: 5, failures: s.failures }).days, 12);
  });
});

describe("the working level, when failures push it past the target", () => {

  test("reaching the level is enough; the chart's equality is a trap", () => {
    // The diamond asks "Does x = Desired Item Level?". Taken literally a process
    // that steps 3 → 5 past a target of 4 can never finish, however well the
    // Maker rolls — the power source branch would be unreachable for the rest of
    // the work. Read as "has it reached", which is what the surrounding text
    // describes, it behaves.
    let s = begin({ level: 4 });
    s = walk(s, ["added", "success", "added", "yes", "success", "added"]);
    assert.equal(s.x, 3, "two ingredients in");

    // A failure here adds a catalyst and a stabilizer, taking x from 3 to 5.
    s = walk(s, ["yes", "failure", "added", "failure", "added"]);
    assert.equal(s.x, 5, "clean past the target of 4");

    s = walk(s, ["success", "taken"]);          // major side effect, back to ingredient
    assert.equal(step(s).node, "ingredient");
    s = advance(s, "added");
    assert.equal(step(s).node, "continue");

    s = advance(s, "no");
    assert.equal(step(s).node, "powerSource", "the work can still be finished");
  });
});

describe("how the walk behaves", () => {

  test("an answer the box does not take changes nothing", () => {
    // A mis-wired caller should stall in place rather than skip a step nobody
    // performed — silently advancing past a challenge is the one failure here
    // that a table would never notice.
    const s = advance(begin({ level: 3 }), "success");
    assert.equal(s.node, "material", "the material box wants a component, not a roll");
  });

  test("a finished process stays finished", () => {
    const done = walk(begin({ level: 1 }), ["added", "success", "added", "no", "added", "success"]);
    assert.equal(ended(done), "created");
    assert.equal(advance(done, "failure"), done, "and cannot be rolled onward");
  });

  test("advancing does not modify the state it was given", () => {
    // What lets a caller keep the previous step to undo to, which matters when
    // the process runs for weeks of game time and somebody misclicks.
    const before = begin({ level: 3 });
    const snapshot = JSON.parse(JSON.stringify(before));
    advance(before, "added");
    assert.deepEqual(before, snapshot);
  });

  test("the history records every box and the answer it took", () => {
    const s = walk(begin({ level: 2 }), ["added", "failure"]);
    assert.deepEqual(s.history.map(h => h.node), ["material", "challenge"]);
    assert.deepEqual(s.history.map(h => h.answer), ["added", "failure"]);
  });

  test("the diamond records itself, since nobody is asked", () => {
    const s = walk(begin({ level: 1 }), ["added", "success", "added", "no"]);
    assert.ok(s.history.some(h => h.node === "atLevel" && h.answer === "yes"));
  });
});

describe("the chart as a whole", () => {

  test("every box leads somewhere that exists", () => {
    // The chart is a config table a house rule can edit. An edge naming a box
    // that is not there would strand a process mid-craft.
    const M = CONFIG.ISUN.makerMatrix;
    for (const [name, box] of Object.entries(M)) {
      for (const [answer, target] of Object.entries(box.next ?? {})) {
        assert.ok(M[target], `${name} --${answer}--> ${target} does not exist`);
      }
      assert.ok(box.ends || box.next, `${name} neither ends nor leads anywhere`);
    }
  });

  test("every box is reachable from the start", () => {
    const M = CONFIG.ISUN.makerMatrix;
    const seen = new Set(["material"]);
    const queue = ["material"];
    while (queue.length) {
      for (const target of Object.values(M[queue.pop()].next ?? {})) {
        if (!seen.has(target)) { seen.add(target); queue.push(target); }
      }
    }
    for (const name of Object.keys(M)) assert.ok(seen.has(name), `${name} is unreachable`);
  });

  test("hurrying raises every challenge in the process", () => {
    // "for every day shaved off the total, all challenges involved are 1 level
    // higher" — all of them, including the recovery ones.
    let s = begin({ level: 3, shaved: 2 });
    s = advance(s, "added");
    assert.equal(step(s).challenge, 3, "the level 1 challenge, two levels higher");

    s = advance(s, "failure");
    s = advance(s, "added");
    assert.equal(step(s).challenge, 5, "and the catalyst's challenge with it");
  });
});
