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

import { parseBlock, startsBlock, describe as describeOf, isName, toItem,
         collect, continuesName, countBoxes }
  from "../../module/importers/creatures.mjs";
import { titleCase } from "../../module/importers/fortes.mjs";

const COLUMN = 72;
const at = (text, x = COLUMN) => ({ text, x });
const lines = (...texts) => texts.map(t => at(t));

/**
 * A run of lines down one column, as the page hands them over.
 *
 * `collect` reads heights and y positions as well as text, so a fixture for it
 * has to carry them. Each entry is `[text]`, `[text, height]`, or
 * `[text, height, leading]` — the gap above that line rather than below it,
 * because that is the measurement the wrapped-name rule makes. Body is 10pt on
 * 12, a name 12 on 13, a section heading 15 on 26; those are the books' own
 * numbers, taken off Teratology.
 */
const column = (...rows) => {
  let y = 0;
  return rows.map(([text, h = 10, leading = h === 15 ? 26 : h + 1]) => {
    y += leading;
    return { text, x: COLUMN, y, h, page: 1, col: 0 };
  });
};

/** The three lines every stat block opens with. */
const BLOCK = [["Level: 4"], ["Injuries:"], ["Wounds:"], ["Anguish:"],
               ["Traits: Timid."]];

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


describe("finding the name above a block", () => {

  test("the nearest line in capitals above the block", () => {
    const found = collect(column(["ALLEGORN", 12], ["Book collector."], ...BLOCK));
    assert.equal(found.length, 1);
    assert.equal(found[0].name, "Allegorn");
    assert.equal(found[0].description, "Book collector.");
  });

  /* Teratology sets "MAJOR CREATURES AND ENTITIES" across two lines at 15pt,
   * and the lower half is capitals, short, and directly above an entry. One
   * creature reached the compendium called "And Entities" because of it. */
  test("a section heading is not a name, either half of it", () => {
    const found = collect(column(["MAJOR CREATURES", 15], ["AND ENTITIES", 15],
                                 ["ALLEGORN", 12], ["Book collector."], ...BLOCK));
    assert.equal(found[0].name, "Allegorn");
  });

  test("and an entry whose own name the heading hides is dropped, not misnamed", () => {
    // No name of its own between the heading and the block: better nothing than
    // "And Entities".
    assert.deepEqual(collect(column(["MAJOR CREATURES", 15], ["AND ENTITIES", 15],
                                    ...BLOCK)), []);
  });

  /* Ten of the 307 entries are set across two lines. Four of those read
   * perfectly well as names on their own, so the wrong name was invisible. */
  test("a name that wraps is taken whole", () => {
    const found = collect(column(["GATIVA VAIL, SECRAMAL DANCER", 12],
                                 ["OF THE THIRD CRIME", 12],
                                 ["A dancer."], ...BLOCK));
    assert.equal(found[0].name, "Gativa Vail, Secramal Dancer of the Third Crime");
  });

  /* The description starts under the last line of the name, not under the
   * first. Reaching back for the rest of a name and then reading downwards
   * from where the reach ended puts the second half of the name at the front
   * of the description — which is a quiet kind of wrong, since it reads as a
   * sentence fragment and nothing counts it. */
  test("and its second line does not turn up again in the description", () => {
    const found = collect(column(["GATIVA VAIL, SECRAMAL DANCER", 12],
                                 ["OF THE THIRD CRIME", 12],
                                 ["A dancer."], ...BLOCK));
    assert.equal(found[0].description, "A dancer.");
  });

  test("the half above is not swallowed when it is a heading, however short", () => {
    // Same shape as a wrap — capitals directly above capitals — and the only
    // thing telling them apart is that a heading is set larger and further off.
    const found = collect(column(["AND ENTITIES", 15], ["THE PLIGHTED TROTH", 12],
                                 ["A troth."], ...BLOCK));
    assert.equal(found[0].name, "The Plighted Troth");
  });

  test("a name does not reach back past the previous entry", () => {
    const found = collect(column(["ALLEGORN", 12], ["Book collector."], ...BLOCK,
                                 ["Some trailing prose."], ...BLOCK));
    // The second block has no name of its own, and must not borrow Allegorn's.
    assert.equal(found.length, 1);
    assert.equal(found[0].name, "Allegorn");
  });
});

describe("telling a wrapped name from the heading above it", () => {

  const line = (text, h, y) => ({ text, h, y, page: 1, col: 0 });

  test("one line's leading, at the same size, is a wrap", () => {
    // Teratology's own numbers: 12pt names, 13 apart.
    assert.equal(continuesName(line("TALYACTRIS OF", 12, 100), line("THE VANCIAN ORDER", 12, 113)), true);
  });

  test("The Nightside sets the same thing a little looser, and it still is", () => {
    assert.equal(continuesName(line("MASTER ACCIPITRARY SEJNUS", 12, 100),
                               line("KADASHMAN-TURGU", 12, 115)), true);
  });

  test("a section heading is further off, and larger", () => {
    assert.equal(continuesName(line("AND ENTITIES", 15, 100), line("ALLEGORN", 12, 126)), false);
  });

  test("the same size but two lines up is not a wrap", () => {
    assert.equal(continuesName(line("SOMETHING ELSE", 12, 100), line("ALLEGORN", 12, 126)), false);
  });

  test("a line in another column is never one, however the numbers fall", () => {
    const above = { text: "TALYACTRIS OF", h: 12, y: 100, page: 1, col: 0 };
    const below = { text: "THE VANCIAN ORDER", h: 12, y: 113, page: 1, col: 1 };
    assert.equal(continuesName(above, below), false);
  });

  test("nor a line on the page before", () => {
    const above = { text: "TALYACTRIS OF", h: 12, y: 100, page: 1, col: 0 };
    const below = { text: "THE VANCIAN ORDER", h: 12, y: 113, page: 2, col: 0 };
    assert.equal(continuesName(above, below), false);
  });

  test("prose above a name is not part of it", () => {
    assert.equal(continuesName(line("was never seen again.", 10, 100), line("ALLEGORN", 12, 111)), false);
  });
});


/* titleCase is shared with the forte and secret importers, but it is the
 * creature names that exercise its edges: the books set every one of them in
 * capitals, and 307 of them turn up more shapes than anything else does. */
describe("turning a name set in capitals into a name", () => {

  test("the ordinary case", () => {
    assert.equal(titleCase("ALLEGORN"), "Allegorn");
    assert.equal(titleCase("THE BALEFIRE SEXTET"), "The Balefire Sextet");
  });

  test("small words stay small in the middle and not at the ends", () => {
    assert.equal(titleCase("THE GARDENER OF BITTERSWEET MALLOW"),
                 "The Gardener of Bittersweet Mallow");
    // Last word, so it keeps its capital even though "of" is in the small set.
    assert.equal(titleCase("NIQUEE CRIENE OF"), "Niquee Criene Of");
  });

  test("both halves of a hyphenated name", () => {
    assert.equal(titleCase("DARK-EYED MANFRED"), "Dark-Eyed Manfred");
    assert.equal(titleCase("KADASHMAN-TURGU"), "Kadashman-Turgu");
    assert.equal(titleCase("Y-H-M OF THE BORNLESS"), "Y-H-M of the Bornless");
  });

  test("a word that opens with punctuation is still capitalised", () => {
    // Upper-casing an opening bracket changes nothing, so this came back as
    // "(demon)" — the one word on the sheet in lower case.
    assert.equal(titleCase("TEUDRAN (DEMON)"), "Teudran (Demon)");
    assert.equal(titleCase("VIDDISHIN (ADULT-SIZED)"), "Viddishin (Adult-Sized)");
  });

  test("initials keep their points and their capitals", () => {
    assert.equal(titleCase("J.C. NEDRICK, ESQUIRE"), "J.C. Nedrick, Esquire");
  });

  test("text that is not in capitals is left exactly as it was", () => {
    // The guard that keeps this off the gear and flux names, which the books
    // set as ordinary sentences.
    assert.equal(titleCase("Wine (bottle, fine)"), "Wine (bottle, fine)");
  });
});


/* ── The three tick-box rows ──
 *
 * The books draw these rather than setting them, so the number is how many
 * squares are on the page. Everything below the counting is ordinary, and the
 * counting is two tolerances, which is what these pin down. The numbers are
 * the Abdominous's, Teratology p.128: twelve, ten and eight, in 8.6pt boxes
 * 11.65 apart on the label's own baseline. */
describe("counting the boxes a label owns", () => {

  const row = (y, n, from = 467) =>
    Array.from({ length: n }, (_, i) => ({ x: from + i * 11.65, y, w: 8.6, h: 8.6 }));
  const label = (y) => ({ x: 428.4, y });

  // Three rows one line apart, as the page sets them.
  const page = [...row(231, 12), ...row(244, 10, 468.8), ...row(257, 8, 469.7)];

  test("each row is counted separately, on its own baseline", () => {
    assert.equal(countBoxes(page, label(231)), 12);
    assert.equal(countBoxes(page, label(244)), 10);
    assert.equal(countBoxes(page, label(257)), 8);
  });

  test("a box sitting slightly off the baseline still counts", () => {
    // A rectangle's y is its foot and a word's is its baseline, so they are
    // near rather than equal.
    assert.equal(countBoxes(row(231, 4), label(235)), 4);
  });

  test("a row a line away does not", () => {
    assert.equal(countBoxes(row(231, 12), label(244)), 0);
  });

  test("nothing to the left of the label", () => {
    // The other column's text sits at x 72 and its boxes, if it had any, with it.
    assert.equal(countBoxes(row(231, 5, 72), label(428.4)), 0);
  });

  test("nor the far column on the same line", () => {
    assert.equal(countBoxes(row(231, 5, 790), label(428.4)), 0);
  });

  test("a label with no boxes at all is nought, not a crash", () => {
    assert.equal(countBoxes([], label(231)), 0);
    assert.equal(countBoxes(undefined, label(231)), 0);
  });
});

describe("what the boxes become", () => {

  const block = (injuries, wounds, anguish) => parseBlock([
    { text: "Injuries:", x: 428.4, y: 231, boxes: injuries },
    { text: "Wounds:",   x: 428.4, y: 244, boxes: wounds },
    { text: "Anguish:",  x: 428.4, y: 257, boxes: anguish },
    { text: "Traits: Hungry.", x: 428.4, y: 270 }
  ]);

  test("the three counts come off the block", () => {
    const out = block(12, 10, 8);
    assert.equal(out.injuries, 12);
    assert.equal(out.wounds, 10);
    assert.equal(out.anguish, 8);
    // And the labels are still not mistaken for named powers.
    assert.deepEqual(out.abilities, []);
    assert.equal(out.traits, "Hungry.");
  });

  test("a row that was never counted stays null", () => {
    const out = parseBlock(lines("Injuries:", "Wounds:", "Anguish:", "Traits: Timid."));
    assert.equal(out.injuries, null);
    assert.equal(out.wounds, null);
    assert.equal(out.anguish, null);
  });

  /* Teratology p11: "when Injuries are all checked, they become a Wound or
   * Anguish, as appropriate (and then reset)" — so the Injuries row is the
   * threshold a set converts at, and the other two are their tracks' capacity. */
  test("injuries are the threshold, wounds and anguish the capacity", () => {
    const item = toItem({ kind: "creature", name: "Abdominous", level: 12,
                          ...block(12, 10, 8) });
    assert.equal(item.system.health.injuryThreshold, 12);
    assert.equal(item.system.health.wounds.max, 10);
    assert.equal(item.system.health.anguish.max, 8);
  });

  test("an entry whose boxes were not read keeps the model's own defaults", () => {
    // Writing zeroes here would be a creature that cannot be hurt or killed.
    const item = toItem({ kind: "creature", name: "Orb", level: 1 });
    assert.deepEqual(item.system.health, {});
  });
});
