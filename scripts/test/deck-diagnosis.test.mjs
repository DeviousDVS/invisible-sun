/**
 * Invisible Sun — why a deck read nothing
 *
 * The reader finds a card by the label printed against its left margin, and
 * when it finds none it has nothing to say about why. This is the report that
 * answers that, and these are the three answers worth telling apart: the file
 * has no text to read, the text is there but chunked differently than this
 * reader expects, or it is text of some other kind entirely.
 *
 * Written because a reader whose Objects of Power deck read zero cards was told
 * "is this the right PDF?" about a file that was the right PDF.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

import { stubFoundry, unstubFoundry } from "./foundry-stub.mjs";
import { anchorReport } from "../../module/importers/spells.mjs";

before(() => stubFoundry());
after(() => unstubFoundry());

const PAGE = 792;

/** A piece of text where pdf.js would put it: x across, y up from the bottom. */
let at = 0;
const piece = (str, x = 40, y = 700 - (at += 12)) =>
  ({ str, width: str.length * 5, transform: [1, 0, 0, 1, x, y] });

/** One card as the decks print it: the labels flush at the card's margin. */
const card = (x) => [
  piece("A STONE CALLED MURDER", x), piece("Level:", x), piece("4", x + 40),
  piece("Form:", x), piece("A fist-sized stone", x + 40),
  piece("Depletion:", x), piece("1 in 10", x + 60),
  piece("Color:", x), piece("Red", x + 44)
];

describe("what a sheet held, when it held no cards", () => {

  test("a sheet of cards counts a label for each", () => {
    at = 0;
    const items = [...card(40), ...card(200), ...card(360)];
    const report = anchorReport(items, PAGE);
    // Level, Form, Depletion and Color on each of the three.
    assert.equal(report.exact, 12);
    assert.equal(report.loose, 12);
    assert.ok(report.words >= 12);
  });

  test("a page with nothing on it is a page with nothing on it", () => {
    // The mark of a scan or a flattened re-export: the picture is there and
    // the text layer is not.
    const report = anchorReport([], PAGE);
    assert.equal(report.words, 0);
    assert.equal(report.exact, 0);
    assert.deepEqual(report.sample, []);
  });

  test("whitespace-only pieces are not text", () => {
    // pdf.js hands back plenty of these, and counting them would report a blank
    // page as one full of text — the one reading that sends somebody looking
    // for a fault in their own file.
    const report = anchorReport([piece("  "), piece("\n"), piece("")], PAGE);
    assert.equal(report.words, 0);
  });

  test("a label split from its colon is seen loosely and not exactly", () => {
    // The case that matters. A PDF produced by another tool may hand over
    // "Level" and ":" as separate pieces, which reads as no label at all — so
    // the grid is never found and every page yields nothing, on a file that is
    // perfectly good. Exactly zero with loose above it is the signature.
    at = 0;
    const items = [piece("A STONE CALLED MURDER"), piece("Level"), piece(":"),
                   piece("4"), piece("Form"), piece(":"), piece("A stone")];
    const report = anchorReport(items, PAGE);
    assert.equal(report.exact, 0, "no whole label to anchor on");
    assert.equal(report.loose, 2, "but the words are plainly there");
  });

  test("a label joined to its value is seen loosely and not exactly", () => {
    // The other way the same thing goes wrong: "Level: 4" as one piece.
    at = 0;
    const report = anchorReport([piece("Level: 4"), piece("Form: A stone")], PAGE);
    assert.equal(report.exact, 0);
    assert.equal(report.loose, 2);
  });

  test("ordinary prose is neither", () => {
    // A page of instructions or a page of backs. Text, but nothing that looks
    // like a card — which is the answer "this is not a sheet of cards", and is
    // different from both of the above.
    at = 0;
    const report = anchorReport([
      piece("To print your Objects of Power deck,"),
      piece("set your double-sided printer to")], PAGE);
    assert.ok(report.words > 0);
    assert.equal(report.exact, 0);
    assert.equal(report.loose, 0);
  });

  test("the sample is the first dozen pieces, in reading order", () => {
    // Twelve pieces of an unfamiliar PDF says more than any count. Down the
    // page and then across it, which is the order somebody reading the log
    // would expect to see them in.
    at = 0;
    const items = Array.from({ length: 30 }, (unused, i) => piece(`piece ${i}`));
    const report = anchorReport(items, PAGE);
    assert.equal(report.sample.length, 12);
    assert.deepEqual(report.sample.slice(0, 3), ["piece 0", "piece 1", "piece 2"]);
  });

  test("the American and British spellings of colour both anchor", () => {
    // The decks print "Color:"; the rule accepts both, and a report that
    // disagreed with the reader would send somebody hunting the wrong thing.
    at = 0;
    assert.equal(anchorReport([piece("Color:"), piece("Colour:")], PAGE).exact, 2);
  });
});
