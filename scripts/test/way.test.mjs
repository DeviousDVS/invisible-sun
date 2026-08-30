/**
 * Invisible Sun — reading the flux charts out of The Way
 *
 * The charts are zebra-striped rows, and none of that survives text
 * extraction, so where one entry ends is decided by the leading alone: a
 * wrapped line sits 13 points below the one before it, a new entry 14 to 16.
 * The numbers below are the ones measured off pages 16 and 17.
 *
 * The cases that matter are the three that a sentence-ending rule would get
 * wrong. They are the reason the leading is used instead, and they are the
 * first thing to break if anyone decides a full stop looks simpler.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { splitEntries, wrapLeading, toItem } from "../../module/importers/way.mjs";

/* Lines as columnLines hands them over, at the real spacings. */
const at = (y, text) => ({ y, text });
const LEADING = 13;

describe("splitting a column into entries", () => {

  test("one line each when nothing wraps", () => {
    const entries = splitEntries([
      at(103, "You spoil milk and other food around you."),
      at(117, "A nearby plant withers."),
      at(132, "Animals of level 2 or lower howl or flee."),
    ], LEADING);

    assert.equal(entries.length, 3);
    assert.equal(entries[1], "A nearby plant withers.");
  });

  test("a wrapped line joins the entry above it", () => {
    const entries = splitEntries([
      at(277, "Your face and extremities become pocked with an itchy rash for"),
      at(290, "the next few hours."),
      at(305, "Nearby children begin to scream and rant for the next few"),
      at(318, "minutes."),
    ], LEADING);

    assert.deepEqual(entries, [
      "Your face and extremities become pocked with an itchy rash for the next few hours.",
      "Nearby children begin to scream and rant for the next few minutes."
    ]);
  });

  test("an entry with a full stop in the middle stays one entry", () => {
    // "Memory lapse. You lose 2 points of Hidden Knowledge." — one line, and a
    // rule that split on sentences would make two of it.
    const entries = splitEntries([
      at(202, "You can’t cast one of your spells for several days."),
      at(216, "Memory lapse. You lose 2 points of Hidden Knowledge."),
      at(231, "A nearby NPC is possessed by a dead spirit."),
    ], LEADING);

    assert.equal(entries.length, 3);
    assert.equal(entries[1], "Memory lapse. You lose 2 points of Hidden Knowledge.");
  });

  test("two sentences that each end a line are still one entry", () => {
    /* "The fabric of space or time is permanently ripped asunder. / Creatures
     * from other realms can come and go." Both lines end in a full stop, and
     * only the leading says they belong together. */
    const entries = splitEntries([
      at(103, "The fabric of space or time is permanently ripped asunder."),
      at(116, "Creatures from other realms can come and go."),
      at(132, "You are driven insane."),
    ], LEADING);

    assert.equal(entries.length, 2);
    assert.equal(entries[0],
      "The fabric of space or time is permanently ripped asunder. "
      + "Creatures from other realms can come and go.");
  });

  test("three lines and two sentences, all one entry", () => {
    const entries = splitEntries([
      at(515, "Until the next full moon, all water in a small radius becomes"),
      at(528, "crystal. It can be smashed into fragments easily, but when the"),
      at(541, "next full moon rises, all the crystal returns to water form."),
      at(556, "A thoughtform equal to the level of the effect is created and"),
      at(569, "loosed into the world."),
    ], LEADING);

    assert.equal(entries.length, 2);
    assert.ok(entries[0].startsWith("Until the next full moon"));
    assert.ok(entries[0].endsWith("returns to water form."));
  });

  test("the whole of one measured column comes back whole", () => {
    // Every gap that appears on the real pages: 13 wraps, 14, 15 and 16 break.
    const entries = splitEntries([
      at(103, "one"), at(116, "wrapped"),
      at(130, "two"), at(143, "wrapped"),
      at(158, "three"),
      at(173, "four"),
      at(187, "five"),
      at(203, "six"),
    ], LEADING);

    assert.deepEqual(entries, ["one wrapped", "two wrapped", "three", "four", "five", "six"]);
  });
});

describe("measuring the leading rather than assuming it", () => {

  test("the smallest step down a page is the wrap", () => {
    assert.equal(wrapLeading([
      [at(103, "a"), at(116, "b"), at(130, "c")],
      [at(103, "d"), at(118, "e")],
    ]), 13);
  });

  test("no wrap to find means no leading", () => {
    // A page whose every entry is one line has nothing to measure, and a guess
    // would invent breaks that are not there.
    assert.equal(wrapLeading([[at(100, "a"), at(115, "b"), at(130, "c")]]), null);
    assert.equal(wrapLeading([[at(100, "a")]]), null);
    assert.equal(wrapLeading([[]]), null);
  });
});

describe("what an entry becomes", () => {

  test("short entries are named by their own text, without the full stop", () => {
    const item = toItem({ intensity: "minor", text: "A nearby plant withers.", page: 16 });
    assert.equal(item.name, "A nearby plant withers");
    assert.equal(item.type, "Flux");
    assert.equal(item.system.intensity, "minor");
    assert.equal(item.system.description, "<p>A nearby plant withers.</p>");
    assert.equal(item.system.source, "The Way");
    assert.equal(item.system.page, 16);
  });

  test("a long entry is cut at a word, and keeps its text in full", () => {
    const text = "Your skin glows like an incandescent bulb permanently. You’re difficult "
      + "to look at and unless you’re clothed head to toe in dark garments, you are "
      + "visible at a great distance.";
    const item = toItem({ intensity: "grand", text, page: 17 });

    assert.ok(item.name.length <= 65, `name is ${item.name.length} long`);
    assert.ok(item.name.endsWith("…"));
    assert.ok(!/\s…$/.test(item.name), "cut left a space before the ellipsis");
    assert.ok(item.system.description.includes("great distance"), "the full text is kept");
  });
});
