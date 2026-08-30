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

import { parseOrder } from "../../module/importers/orders.mjs";

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
