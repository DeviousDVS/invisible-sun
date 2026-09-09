/**
 * Invisible Sun — the three tables the Maker's Matrix consults
 *
 * The Effects by Level table is two columns to a page, and each column is
 * itself two: a gutter holding the level and the effects beside it. Every
 * coordinate below is measured off pages 23 to 25 of The Way — gutters at 87
 * and 384, effects at 112 and 409, entries 15 points apart and wrapped lines
 * 13.
 *
 * Four bugs came out of writing this reader and every one of them is pinned
 * here. The first is the one worth reading twice: lines were being grouped
 * across the whole page rather than within a column, so a line began with
 * whichever column sat further left and every level in a right-hand gutter was
 * invisible. That is levels 8, 9 and 14 through 17 — half the table above level
 * seven — silently absent, with the other half looking perfectly correct.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

import { stubFoundry, unstubFoundry } from "./foundry-stub.mjs";
import { effectsReader, effectTables, sideEffectTables, mishapTables }
  from "../../module/importers/matrix-tables.mjs";

before(() => stubFoundry());
after(() => unstubFoundry());

/** A word where the page puts it. */
const w = (text, x, y) => ({ text, x, y, h: 10 });

/** The real geometry of the table. */
const GUTTER = { left: 87, right: 384 };
const TEXT = { left: 112, right: 409 };
const ENTRY = 15;
const WRAP = 13;

/**
 * One column of the table as words: a level, then its effects down the page.
 *
 * `lines` is a list of strings; one that begins with a space is a wrapped
 * continuation of the line above and sits a wrap's leading below it rather than
 * an entry's.
 */
function column(side, level, lines, top = 110) {
  const words = [w(String(level), GUTTER[side], top)];
  let y = top;
  for (const [i, line] of lines.entries()) {
    const wrapped = line.startsWith(" ");
    if (i > 0) y += wrapped ? WRAP : ENTRY;
    for (const [j, piece] of line.trim().split(" ").entries()) {
      words.push(w(piece, TEXT[side] + j * 12, y));
    }
  }
  return words;
}

/** The heading that opens the table, where the book sets it. */
const heading = () => [w("EFFECTS", 72, 77), w("BY", 108, 77),
                       w("LEVEL", 120, 77), w("TABLE", 148, 77)];

/**
 * One page of the table.
 *
 * The heading comes with it, because the reader will not open without one — the
 * book is a hundred and twenty-six pages and a bare number with text beside it
 * describes a great deal that is not this table.
 *
 * Its words sit at ordinary word spacing. Set them 46 points apart, as a first
 * draft of this fixture did, and the line splits at what the reader takes for a
 * column gutter — the heading never matches and every case below reads as a
 * page with no table on it.
 */
const read = (words) => {
  const reader = effectsReader();
  reader.page([...heading(), ...words]);
  return reader.done();
};

describe("finding the levels", () => {

  test("a level in the right-hand gutter is found", () => {
    // THE bug. Grouped across the page, the line at this baseline begins with
    // the left column's word and the level in the right gutter never opens a
    // line of its own — so it is never seen, and the whole of its column is
    // attributed to whatever level was open before.
    const words = [
      ...column("left", 3, ["Cause a creature to flee"]),
      ...column("right", 8, ["Slay a creature outright"])
    ];
    const got = read(words);
    assert.deepEqual(got.map(e => e.level).sort((a, b) => a - b), [3, 8]);
    assert.equal(got.find(e => e.level === 8).text, "Slay a creature outright");
  });

  test("both columns keep their own effects", () => {
    const words = [
      ...column("left", 1, ["Inflict 1 damage", "Blind creature"]),
      ...column("right", 9, ["Raise the dead"])
    ];
    const got = read(words);
    assert.equal(got.filter(e => e.level === 1).length, 2);
    assert.equal(got.filter(e => e.level === 9).length, 1);
  });

  test("a level carries its effects until the next level", () => {
    // A wrapped line is in here on purpose. Where entries end is decided by the
    // leading, and the leading is measured from the column -- so a column with
    // no wrapped line in it offers nothing to measure against, its entry gap is
    // read as the wrap, and every entry merges into one. Real pages of this
    // table always wrap somewhere, which is why that is a fixture problem
    // rather than a reader one; the case below states it outright so nobody
    // rediscovers it as a bug.
    const words = [
      ...column("left", 1, ["Inflict 1 damage", "Blind creature"], 110),
      ...column("left", 2, ["Create a temporary item or structure no larger than",
                            " a small area"], 200)
    ];
    const got = read(words);
    assert.deepEqual(got.map(e => `${e.level}:${e.text}`), [
      "1:Inflict 1 damage",
      "1:Blind creature",
      "2:Create a temporary item or structure no larger than a small area"
    ]);
  });

  test("a column of evenly spaced one-liners keeps them apart", () => {
    // Nothing wraps here, so there is no wrap leading to measure -- every gap
    // is the same. Read as "no wrapped lines on this page", which is the truth,
    // each line stands alone. Read as a measurement it would come back as the
    // entry gap and merge the column into a single entry, which is what the
    // reader did before an unmeasurable leading was allowed to mean zero.
    const got = read(column("left", 1, ["Inflict 1 damage", "Blind creature"]));
    assert.deepEqual(got.map(e => e.text), ["Inflict 1 damage", "Blind creature"]);
  });

  test("a wrapped effect stays one effect", () => {
    const words = column("left", 4, [
      "Move up to 25 pounds (11 kg) (a car tire or an average",
      " two-year-old human), ongoing",
      "Blind creature"
    ]);
    const got = read(words);
    assert.equal(got.length, 2);
    assert.equal(got[0].text,
      "Move up to 25 pounds (11 kg) (a car tire or an average two-year-old human), ongoing");
  });

  test("a page number in the footer is not a level", () => {
    // Bare, and alone at the left of its own line: "22" and "15" both arrived
    // as levels until a mark was made to prove it has effects set in beside it
    // on the same baseline. A page number has nothing beside it.
    const words = [
      ...column("left", 1, ["Inflict 1 damage"], 110),
      ...column("left", 2, ["Inflict 2 damage"], 200),
      w("22", 34, 686)
    ];
    const got = read(words);
    assert.deepEqual([...new Set(got.map(e => e.level))].sort((a, b) => a - b), [1, 2]);
  });

  test("an effect that opens with a figure is not a level", () => {
    // "+1 on a significant action" and "20 damage" both start with something
    // numeric. A level is a level because of where it sits.
    const words = column("left", 5, ["20 damage to a single target", "Blind creature"]);
    const got = read(words);
    assert.equal(got.length, 2);
    assert.equal(got.every(e => e.level === 5), true);
  });

  test("a page with no table on it yields nothing", () => {
    // Every page of the book is offered to every reader, so a page of prose
    // must come back empty rather than inventing a level out of a stray figure.
    assert.deepEqual(read([
      w("Makers", 72, 100), w("make.", 110, 100),
      w("It", 72, 115), w("is", 90, 115), w("what", 105, 115), w("they", 135, 115)
    ]), []);
  });
});

describe("where the table starts and stops", () => {

  test("nothing is read before the heading", () => {
    // The whole of the reason for the gate. A numbered list with text beside it
    // is a level as far as the geometry is concerned, and the book is full of
    // them — read across all 126 pages it returned 571 effects where there are
    // 180, and a level 0 among them.
    const reader = effectsReader();
    reader.page(column("left", 3, ["Feed the vislae", "Pay the piper"]));
    assert.deepEqual(reader.done(), []);
  });

  test("the table runs on past the page its heading is on", () => {
    // Three consecutive pages, and only the first carries the heading.
    const reader = effectsReader();
    reader.page([...heading(), ...column("left", 1, ["Inflict 1 damage",
                                                     "Blind a creature outright",
                                                     " for a round"])]);
    reader.page(column("left", 2, ["Inflict 2 damage",
                                   "Blind a creature outright",
                                   " for a minute"]));
    assert.deepEqual([...new Set(reader.done().map(e => e.level))], [1, 2]);
  });

  test("and stops at the first page that has no levels on it", () => {
    // What keeps the rest of the book out once the table has been opened.
    const reader = effectsReader();
    reader.page([...heading(), ...column("left", 1, ["Inflict 1 damage",
                                                     "Blind a creature outright",
                                                     " for a round"])]);
    reader.page([w("Makers", 72, 100), w("make.", 110, 100)]);
    reader.page(column("left", 9, ["Something from much later in the book"]));
    assert.deepEqual([...new Set(reader.done().map(e => e.level))], [1]);
  });
});

describe("what the entries become", () => {

  test("one table a level, in order", () => {
    // The question a Maker asks is "what is a level 5 effect", so the level is
    // the index. A single table of a hundred and eighty could only answer it by
    // being read end to end.
    const tables = effectTables([
      { level: 2, text: "Inflict 2 damage" },
      { level: 1, text: "Inflict 1 damage" },
      { level: 2, text: "Blind creature" }
    ]);
    assert.deepEqual(tables.map(t => t.name),
      ["Effects by Level — 1", "Effects by Level — 2"]);
    assert.equal(tables[1].results.length, 2);
  });

  test("the formula spans the entries", () => {
    const [table] = mishapTables(Array.from({ length: 20 },
      (unused, i) => ({ text: `Mishap ${i + 1}` })));
    assert.equal(table.formula, "1d20");
    assert.deepEqual(table.results.at(-1).range, [20, 20]);
  });

  test("a result carries its text in `name`", () => {
    // Foundry moved a text result's field from `text` to `name` in v13. Written
    // the old way every table rolls a blank and nothing complains — which is
    // exactly the kind of break that reaches a table before it reaches anyone.
    const [table] = mishapTables([{ text: "Portal to the Dark opens" }]);
    assert.equal(table.results[0].name, "Portal to the Dark opens");
    assert.equal(table.results[0].type, "text");
  });

  test("the two side-effect lists become two tables", () => {
    const tables = sideEffectTables([
      { severity: "minor", text: "Item glows blue when used" },
      { severity: "major", text: "Item drains nearby ephemera when used" },
      { severity: "minor", text: "User must whistle to use item" }
    ]);
    assert.deepEqual(tables.map(t => t.name), ["Minor Side Effects", "Major Side Effects"]);
    assert.equal(tables[0].results.length, 2);
    assert.equal(tables[1].formula, "1d1");
  });

  test("a list nobody read makes no table at all", () => {
    // Better an absent table than one that rolls on nothing.
    assert.deepEqual(sideEffectTables([]), []);
    assert.deepEqual(effectTables([]), []);
  });

  test("every entry is equally likely", () => {
    // The books print these as lists to choose from or roll on, and weight
    // nothing in them.
    const [table] = mishapTables([{ text: "a" }, { text: "b" }, { text: "c" }]);
    assert.deepEqual(table.results.map(r => r.weight), [1, 1, 1]);
    assert.deepEqual(table.results.map(r => r.range), [[1, 1], [2, 2], [3, 3]]);
  });
});
