/**
 * Invisible Sun — reading an order's ladder out of The Key
 *
 * `parseOrder` takes positioned lines and decides what each one belongs to, so
 * it can be tested without a PDF: the fixtures below are the shapes the page
 * actually puts in front of it, at the indents it actually uses.
 *
 * The case that matters is the last one. A degree's abilities run to more than
 * one paragraph, and a second paragraph looks exactly like a return to the
 * requirement text — same indent, no label. Guessed wrong, nothing is lost and
 * nothing errors; the text simply lands in the neighbouring field, and the
 * compendium looks complete while saying the wrong thing in the wrong place.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { parseOrder, reader } from "../../module/importers/orders.mjs";

/* The page sets a degree's heading and its requirement flush at the column, and
 * everything inside a degree one indent in — the ability labels, and the
 * paragraphs that follow them. PARAGRAPH_SLACK is 3 and BULLET_INDENT is 14, so
 * flush is the column itself and "labelled" is 6 past it.
 *
 * A degree heading has to be flush: DEGREE_RE is only tried on lines that are
 * not labelled, because an indented "1st-Degree…" inside a paragraph is prose. */
const COLUMN = 100;
const flush = (text) => ({ text, x: COLUMN });
const label = (text) => ({ text, x: COLUMN + 6 });

const join = (parts) => parts.join(" ");

describe("a degree's requirement and its abilities", () => {

  test("the requirement is what comes before the abilities", () => {
    const order = parseOrder([
      flush("1st-Degree Vance: Postulant"),
      flush("Vance characters start at the 1st degree with the following abilities."),
      label("Ephemera Use: We can safely possess three ephemera at any given time."),
    ], COLUMN);

    const degree = order.degrees[0];
    assert.equal(degree.degree, 1);
    assert.equal(degree.title, "Postulant");
    assert.equal(join(degree.requirement),
      "Vance characters start at the 1st degree with the following abilities.");
    assert.equal(degree.abilities.length, 1);
  });

  test("an ability's own wrapped lines stay with it", () => {
    const order = parseOrder([
      flush("1st-Degree Vance: Postulant"),
      label("Ephemera Use: We can safely possess"),
      flush("three ephemera at any given time."),
    ], COLUMN);

    assert.equal(join(order.degrees[0].abilities[0].description),
      "We can safely possess three ephemera at any given time.");
  });

  test("a second paragraph belongs to the ability, not back to the requirement", () => {
    /* The Vance's 1st degree. "Vancian Spells" runs to several paragraphs, and
     * every one after the first is set at the label indent without a label —
     * indistinguishable from requirement text except by what has already been
     * read. */
    const order = parseOrder([
      flush("1st-Degree Vance: Postulant"),
      flush("Vance characters start at the 1st degree with the following abilities."),
      label("Vancian Spells: We have a grimoire with six Vancian spells."),
      label("When we want to use a spell, we draw it into ourselves."),
      label("This preparation process takes about an hour."),
    ], COLUMN);

    const degree = order.degrees[0];
    assert.equal(join(degree.requirement),
      "Vance characters start at the 1st degree with the following abilities.",
      "the requirement is stated once and does not resume");
    assert.equal(join(degree.abilities[0].description),
      "We have a grimoire with six Vancian spells. "
      + "When we want to use a spell, we draw it into ourselves. "
      + "This preparation process takes about an hour.");
  });

  test("a trailing sentence lands on the last ability, not the requirement", () => {
    // The 3rd to 6th degrees each end with a free spell, printed after the
    // ability it belongs to. It used to be appended to the requirement above.
    const order = parseOrder([
      flush("3rd-Degree Vance: Magister"),
      flush("A Vance can attain the 3rd degree only after developing a new spell."),
      label("Vancian Spells: The total space we have is now 3 inches by 6 inches."),
      label("We also automatically learn one new Vancian spell at no cost."),
    ], COLUMN);

    const degree = order.degrees[0];
    assert.ok(!join(degree.requirement).includes("automatically"),
      `the requirement swallowed the ability's tail: ${join(degree.requirement)}`);
    assert.ok(join(degree.abilities[0].description).includes("automatically learn one new"));
  });

  test("a following ability still starts cleanly after a second paragraph", () => {
    // The rule must not be so eager that it eats the next label.
    const order = parseOrder([
      flush("1st-Degree Vance: Postulant"),
      label("Vancian Spells: We have a grimoire with six Vancian spells."),
      label("This preparation process takes about an hour."),
      label("Authority and Responsibilities: We have authority over journeymen."),
    ], COLUMN);

    const abilities = order.degrees[0].abilities;
    assert.deepEqual(abilities.map(a => a.name),
      ["Vancian Spells", "Authority and Responsibilities"]);
    assert.equal(join(abilities[1].description), "We have authority over journeymen.");
  });

  test("a new degree ends the one before it", () => {
    const order = parseOrder([
      flush("1st-Degree Vance: Postulant"),
      label("Vancian Spells: Six spells."),
      label("A second paragraph."),
      flush("2nd-Degree Vance: Velator"),
      flush("A Vance can attain the 2nd degree only with sponsorship."),
    ], COLUMN);

    assert.equal(order.degrees.length, 2);
    assert.equal(join(order.degrees[0].abilities[0].description), "Six spells. A second paragraph.");
    assert.equal(join(order.degrees[1].requirement),
      "A Vance can attain the 2nd degree only with sponsorship.");
    assert.equal(order.degrees[1].abilities.length, 0);
  });
});

describe("a box set inside a column", () => {

  /* Measured on The Key's page 43, where the Vance's 2nd degree is cut in two.
   * The column edge is 72; the box heading sits at 81 and is set at 12 points
   * against the body's 10; the box body sits at 81 and 90; and the sentence
   * the box interrupted picks up below it, back at 72.
   *
   * The heading has to clear HEADING_HEIGHT (11.5) and be in capitals for
   * isHeading to see it, so `box` sets a real height where the other helpers
   * leave it at the body's. */
  const body = (text) => ({ text, x: COLUMN, h: 10 });
  const para = (text) => ({ text, x: COLUMN + 9, h: 10 });
  const box = (text) => ({ text, x: COLUMN + 9, h: 12 });
  const boxLine = (text) => ({ text, x: COLUMN + 18, h: 10 });

  test("the box is lifted out and the sentence closes over it", () => {
    const order = parseOrder([
      body("2nd-Degree Vance: Velator"),
      body("A Vance can attain the 2nd degree only with sponsorship."),
      para("Vancian Spells: The storage space does not increase; we can reduce the"),
      box("VANCIAN MAGIC"),
      boxLine("1. The Vance chooses a spell they have stored"),
      para("in their mind."),
      body("occupying space of two of the spells we know to half their original size."),
    ], COLUMN);

    const ability = order.degrees[0].abilities[0];
    assert.equal(join(ability.description),
      "The storage space does not increase; we can reduce the "
      + "occupying space of two of the spells we know to half their original size.",
      "the box was spliced into the middle of the sentence");

    assert.equal(order.sidebars.length, 1);
    assert.equal(order.sidebars[0].heading, "VANCIAN MAGIC");
    assert.equal(join(order.sidebars[0].lines),
      "1. The Vance chooses a spell they have stored in their mind.");
  });

  test("a label right after a box ends it, indented or not", () => {
    /* The Goetic. "Path to Despair:" follows the BEINGS AND THE REALMS box and
     * is set at the same indent the box's own lines use, so a box that ended
     * only at the column edge swallowed it — and the despair text ran on into
     * Path to Joy, which then had no reason to close. */
    const order = parseOrder([
      para("Path to Joy: The following actions give us Joy."),
      body("Complete a successful colloquy."),
      box("BEINGS AND THE REALMS"),
      boxLine("Each sun shines down upon a different realm."),
      para("Path to Despair: The following actions give us"),
      body("Despair."),
      body("A summoned being gets out of our control."),
    ], COLUMN);

    assert.equal(join(order.fields["Path to Joy"]),
      "The following actions give us Joy. Complete a successful colloquy.");
    assert.equal(join(order.fields["Path to Despair"]),
      "The following actions give us Despair. A summoned being gets out of our control.");
    assert.equal(order.sidebars.length, 1);
  });

  test("an ability label right after a box ends it too", () => {
    const order = parseOrder([
      body("1st-Degree Goetic: Neophyte"),
      para("Summoning: We can call a being."),
      box("GOETIC MAGIC"),
      boxLine("1. The Goetic decides what sort of entity they wish."),
      para("Identify Spirit: We can name what we see."),
    ], COLUMN);

    assert.deepEqual(order.degrees[0].abilities.map(a => a.name),
      ["Summoning", "Identify Spirit"]);
    assert.equal(join(order.degrees[0].abilities[1].description), "We can name what we see.");
  });

  test("a heading that wraps is one box, not two", () => {
    // The Goetic's "FAVORING THE / RIGHT OR LEFT HAND" came back as two, the
    // first of them a fragment with no text under it.
    const order = parseOrder([
      body("We Goetics summon."),
      box("FAVORING THE"),
      box("RIGHT OR LEFT HAND"),
      boxLine("Some Goetics refer to themselves as favoring a hand."),
      body("And so we do."),
    ], COLUMN);

    assert.equal(order.sidebars.length, 1);
    assert.equal(order.sidebars[0].heading, "FAVORING THE RIGHT OR LEFT HAND");
    assert.equal(join(order.sidebars[0].lines),
      "Some Goetics refer to themselves as favoring a hand.");
  });

  test("two boxes in a row stay two boxes", () => {
    const order = parseOrder([
      box("ONE"),
      boxLine("The first."),
      box("TWO"),
      boxLine("The second."),
      body("Prose again."),
    ], COLUMN);

    assert.deepEqual(order.sidebars.map(b => b.heading), ["ONE", "TWO"]);
  });

  test("an order's own heading is flush and is not a box", () => {
    // Both are set large and in capitals. Only where they sit tells them apart,
    // and the reader above hands parseOrder the body of one order at a time.
    const order = parseOrder([
      { text: "VANCE", x: COLUMN, h: 13 },
      body("We Vances are exemplary casters of spells."),
    ], COLUMN);

    assert.equal(order.sidebars.length, 0);
  });

  test("a box before any degree does not disturb the description", () => {
    const order = parseOrder([
      body("We Vances are exemplary casters of spells."),
      box("BEINGS AND THE REALMS"),
      boxLine("Each sun shines down upon a different realm."),
      body("Our spells vibrate and seethe."),
    ], COLUMN);

    assert.equal(join(order.description),
      "We Vances are exemplary casters of spells. Our spells vibrate and seethe.");
    assert.equal(order.sidebars[0].heading, "BEINGS AND THE REALMS");
  });
});

describe("remembering where a heading was printed", () => {

  /* `sigils` cuts the mark above an order's name, and the only way it can find
   * one is to be told where the name was. That comes off the reader, so this
   * exercises the reader itself rather than parseOrder — which means building a
   * page of words, since columnAnchors needs several lines sharing a start
   * before it will call anything a column. */
  const word = (text, x, y, h = 10) => ({ x, y, w: text.length * 5, h, font: "f1", text });

  const pageOf = (rows) => rows.flatMap(([text, x, y, h]) => [word(text, x, y, h)]);

  test("an order carries its heading's page and position", () => {
    const read = reader();
    read.page(pageOf([
      ["VANCE", 72, 100, 12],
      ["We Vances are exemplary casters of spells.", 72, 120],
      ["Philosophy and Outlook: Magic is a living thing.", 81, 133],
      ["1st-Degree Vance: Postulant", 72, 146],
      ["A Vance begins here.", 72, 159],
      ["Vancian Spells: Six of them.", 81, 172],
      ["More about spells.", 72, 185],
    ]), 39);
    const [order] = read.done();

    assert.equal(order.name, "Vance");
    assert.equal(order.headAt.page, 39, "the heading's own page, not the body's");
    assert.equal(order.headAt.y, 100);
    assert.equal(order.headAt.anchor, 72);
    assert.equal(order.headAt.first, 72);
  });

  test("a heading at the foot of a page keeps that page, not the next", () => {
    // The sigil is beside the name. A heading that opens onto the page after it
    // would send the cut to the wrong sheet.
    const read = reader();
    read.page(pageOf([
      ["Some earlier prose.", 72, 100],
      ["More earlier prose.", 72, 113],
      ["Still more of it.", 72, 126],
      ["And a fourth line.", 72, 139],
      ["GOETIC", 72, 640, 12],
    ]), 54);
    /* Four lines flush at the column, minimum: columnAnchors will not call
     * anything a column on fewer, and a page it finds no column on is skipped
     * whole. */
    read.page(pageOf([
      ["We Goetics summon.", 72, 100],
      ["Spirits answer when called.", 72, 113],
      ["Philosophy and Outlook: Spirits answer.", 81, 126],
      ["1st-Degree Goetic: Neophyte", 72, 139],
      ["A Goetic begins here.", 72, 152],
      ["Summoning: We call a being.", 81, 165],
    ]), 55);
    const [order] = read.done();

    assert.equal(order.name, "Goetic");
    assert.equal(order.headAt.page, 54);
    assert.equal(order.page, 55, "the body still knows its own page");
  });
});

describe("the order's own fields", () => {

  test("the five labelled fields are read before any degree", () => {
    const order = parseOrder([
      flush("We Vances are exemplary casters of spells."),
      label("Other Names: Book mages"),
      label("Philosophy and Outlook: Magic is a living thing."),
      flush("Spells are tools."),
      flush("1st-Degree Vance: Postulant"),
    ], COLUMN);

    assert.equal(join(order.fields["Other Names"]), "Book mages");
    assert.equal(join(order.fields["Philosophy and Outlook"]),
      "Magic is a living thing. Spells are tools.");
    assert.equal(order.degrees.length, 1);
  });

  test("a wrapped degree title is taken from the line below", () => {
    // Four of the Weaver's six wrap. Read as headings that must carry their own
    // title, the order came back with one degree instead of six.
    const order = parseOrder([
      flush("1st-Degree Weaver:"),
      flush("Apprentice of the Spindle"),
      flush("A Weaver can begin here."),
    ], COLUMN);

    assert.equal(order.degrees[0].title, "Apprentice of the Spindle");
    assert.equal(join(order.degrees[0].requirement), "A Weaver can begin here.");
  });
});
