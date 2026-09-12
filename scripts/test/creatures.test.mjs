/**
 * Invisible Sun — reading a creature's stat block
 *
 * `parseBlock` and `startsBlock` take positioned lines and decide what each one
 * belongs to, so they can be tested without a PDF. The fixtures below are the
 * shapes the books actually put in front of them, taken from real entries in
 * Teratology, The Path and The Nightside.
 *
 * The cases that matter are the ones that fail quietly. A spell's `Level:` read
 * as a creature adds several hundred actors that are not creatures. A wrapped
 * line lost from a Modifications field leaves a compendium that looks complete
 * and says half of what the book says. Neither errors.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { parseBlock, startsBlock, describe as describeOf, isName, toItem }
  from "../../module/importers/creatures.mjs";

const COLUMN = 72;
const at = (text, x = COLUMN) => ({ text, x });
const lines = (...texts) => texts.map(t => at(t));

describe("telling a stat block from everything else with a level", () => {

  test("the three boxes under the level are the signature", () => {
    const ls = lines("Level: 4", "Injuries:", "Wounds:", "Anguish:", "Traits: Timid.");
    assert.deepEqual(startsBlock(ls, 0), { level: 4 });
  });

  test("a spell's level is not a stat block", () => {
    // Van Hauten prints four hundred of these. None is a creature.
    const ls = lines("Level: 6", "You can change the requirements of a long-form",
                     "ritual, adding or removing components.");
    assert.equal(startsBlock(ls, 0), null);
  });

  test("a secret's level, with a dice bonus, is not one either", () => {
    assert.equal(startsBlock(lines("Level: 3 (+1 die)", "Your spells inflict +2 damage."), 0), null);
  });

  test("two of the three boxes is not enough", () => {
    // A partial match would let a truncated page through as a creature.
    assert.equal(startsBlock(lines("Level: 4", "Injuries:", "Wounds:", "Traits: Timid."), 0), null);
  });

  test("the boxes must be in the printed order", () => {
    assert.equal(startsBlock(lines("Level: 4", "Wounds:", "Injuries:", "Anguish:"), 0), null);
  });
});

describe("the fields of a block", () => {

  test("a whole entry, as Teratology sets it", () => {
    const block = parseBlock(lines(
      "Injuries:", "Wounds:", "Anguish:",
      "Defenses: Magic (two successes); +3 Dodge",
      "Modifications: +3 stealth; +3 manage, organize, and",
      "remember books",
      "Fictional Genesis: Object, creature, or sometimes",
      "concept (or spell effect) of up to level 7 emerges",
      "from touched book for up to an hour.",
      "Traits: Organized. Bookish. Timid."
    ));

    assert.deepEqual(block.defenses, [{ kind: "", text: "Magic (two successes); +3 Dodge" }]);
    assert.equal(block.modifications, "+3 stealth; +3 manage, organize, and remember books");
    assert.equal(block.traits, "Organized. Bookish. Timid.");
    assert.deepEqual(block.abilities, [{
      name: "Fictional Genesis",
      description: "Object, creature, or sometimes concept (or spell effect) "
                 + "of up to level 7 emerges from touched book for up to an hour."
    }]);
  });

  test("a wrapped field keeps the rest of its text", () => {
    // The books wrap without indenting, so a continuation looks like a new line
    // of nothing in particular. Dropped, the field reads as half the rule.
    const block = parseBlock(lines(
      "Modifications: +3 detect falsehoods, +2 to all",
      "attempts to read a mind"));
    assert.equal(block.modifications, "+3 detect falsehoods, +2 to all attempts to read a mind");
  });

  test("two defence profiles are kept apart", () => {
    // Eighty-five entries are one thing in the world and another out of it.
    const block = parseBlock(lines(
      "Defenses (Spiritual): Magic (two successes);",
      "immune to physical attacks; +2 to all defenses",
      "Defenses (Physical): Magic (two successes); +2 to all",
      "defenses"));
    assert.deepEqual(block.defenses, [
      { kind: "Spiritual", text: "Magic (two successes); immune to physical attacks; +2 to all defenses" },
      { kind: "Physical", text: "Magic (two successes); +2 to all defenses" }
    ]);
  });

  test("armor is a number, and keeps the circumstance it applies in", () => {
    assert.equal(parseBlock(lines("Armor: +3")).armor, 3);
    const conditional = parseBlock(lines("Armor: +4 (while dancing)"));
    assert.equal(conditional.armor, 4);
    assert.equal(conditional.armorNote, "while dancing");
    // One entry prints it without the plus.
    assert.equal(parseBlock(lines("Armor: 2")).armor, 2);
  });

  test("several named powers each keep their own name", () => {
    const block = parseBlock(lines(
      "Bite: 4 points of damage",
      "Cold Touch: 2 points of damage and the target is",
      "slowed until the end of the next round",
      "Traits: Savage."));
    assert.deepEqual(block.abilities, [
      { name: "Bite", description: "4 points of damage" },
      { name: "Cold Touch", description: "2 points of damage and the target is slowed until the end of the next round" }
    ]);
    assert.equal(block.traits, "Savage.");
  });

  test("a power need not be in title case", () => {
    // Title case was tried as the test and threw away 44 real abilities across
    // the three books — the books simply do not name them that way.
    const block = parseBlock(lines(
      "Claws or bite: 1 damage (2 if a predator)",
      "Immunity to Magic: unaffected by spells of level 4 or lower",
      "Mountain Smash (when vast): 8 points of damage"));
    assert.deepEqual(block.abilities.map(a => a.name),
      ["Claws or bite", "Immunity to Magic", "Mountain Smash (when vast)"]);
  });

  test("a runaway sentence is not taken for a power", () => {
    // Not a classifier, just a guard: a label with a full stop in it, or one
    // longer than any the books use, is prose that wandered in.
    const block = parseBlock(lines(
      "Bite: 4 points of damage",
      "It abides no light. Sunlight: it cannot bear at all."));
    assert.deepEqual(block.abilities.map(a => a.name), ["Bite"]);
    assert.match(block.abilities[0].description, /Sunlight/);
  });

  test("the empty boxes contribute nothing", () => {
    // They are tick boxes, printed blank in all 310 entries.
    const block = parseBlock(lines("Injuries:", "Wounds:", "Anguish:"));
    assert.deepEqual(block.abilities, []);
    assert.deepEqual(block.defenses, []);
    assert.equal(block.traits, "");
  });
});

describe("the description", () => {

  test("page furniture is not description", () => {
    assert.equal(describeOf(lines(
      "Humanlike creature with a candleflame of blue fire",
      "24",
      "Doorcat, page 25",
      "and black smoke for a head.")),
      "Humanlike creature with a candleflame of blue fire and black smoke for a head.");
  });

  test("a description set in a narrow margin column still reads", () => {
    // Four entries are set three or four words to the line. Filtering by line
    // length — the obvious way to drop furniture — loses exactly these.
    assert.equal(describeOf(lines(
      "there as “the Bone", "Librarian.” He", "apparently collects all",
      "variety of bones")),
      "there as “the Bone Librarian.” He apparently collects all variety of bones");
  });
});

describe("names", () => {
  test("a creature's name is capitals and short", () => {
    assert.ok(isName("ALLEGORN"));
    assert.ok(isName("IENU, ANGEL OF EXECUTIONS"));
    assert.ok(isName("VALAINE (VAMPIRE)"));
  });
  test("body text is not a name", () => {
    assert.ok(!isName("Humanlike creature with a candleflame"));
    assert.ok(!isName("A"));
  });

  test("a name may carry a colon", () => {
    // Teratology splits a kind from the particular thing this way.
    assert.ok(isName("CYST SPAWN: SHIVERBLOAT"));
  });

  test("a capitalised sentence in a sidebar is not a name", () => {
    // These are set at body size beside the entries, and read as names until
    // the full stop is taken as the thing that tells them apart.
    assert.ok(!isName("PROVENANCE. PURCHASE AT YOUR OWN RISK."));
  });

  test("a name may carry initials", () => {
    // J.C. NEDRICK, ESQUIRE — the full stop rule that keeps sidebar sentences
    // out must not take the initials with it.
    assert.ok(isName("J.C. NEDRICK, ESQUIRE"));
  });

  test("a name may carry quoted epithets", () => {
    assert.ok(isName("EUSTORGIO \u201cTHE VARLET\u201d MAZELLA"));
  });

  test("a full stop after a whole word is still a sentence", () => {
    // The distinction is the letter before the point: an initial is one letter.
    assert.ok(!isName("PROVENANCE. PURCHASE AT YOUR OWN RISK."));
    assert.ok(!isName("IT ENDS. NOTHING FOLLOWS"));
  });

  test("names the books set at body size still count", () => {
    // The Path sets these at 10pt, the same as its prose; Teratology does the
    // same for the second half of a split entry. Testing on type size lost ten.
    assert.ok(isName("TYPICAL MEDIUM ANIMAL"));
    assert.ok(isName("VIDDISHIN (ADULT-SIZED)"));
  });
});

describe("what reaches the compendium", () => {
  test("a creature becomes a Creature, an NPC an NPC", () => {
    assert.equal(toItem({ kind: "creature", name: "Allegorn", level: 4 }).type, "Creature");
    assert.equal(toItem({ kind: "npc", name: "Viara", level: 6 }).type, "NPC");
  });

  test("the description is wrapped, and provenance is kept", () => {
    const item = toItem({ kind: "creature", name: "Allegorn", level: 4,
                          description: "Book collector.", source: "Teratology", page: 24 });
    assert.equal(item.system.description, "<p>Book collector.</p>");
    assert.equal(item.system.source, "Teratology");
    assert.equal(item.system.page, 24);
  });

  test("an entry with nothing but a level still makes a valid actor", () => {
    const item = toItem({ kind: "creature", name: "Orb", level: 1 });
    assert.equal(item.system.armor, 0);
    assert.deepEqual(item.system.defenses, []);
    assert.equal(item.system.description, "");
  });
});
