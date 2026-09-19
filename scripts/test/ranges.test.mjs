/**
 * Invisible Sun — how far away a thing is
 *
 * "In Invisible Sun, distances are divided into four categories" (The Gate,
 * p22), and the whole point of them is that nobody measures. What the overlay
 * does is show where the four words fall, so the cases here are about the two
 * ways that could lie: a band drawn at the wrong distance, and a band drawn at
 * all on a scene that never said what a pixel is worth.
 *
 * The real config is used rather than a fake one — a test against an invented
 * table would agree with itself and with nothing in the books.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

import { stubFoundry, unstubFoundry } from "./foundry-stub.mjs";
import { isMetric, knownUnits, bands, pixelsPerUnit, rings, bandAt }
  from "../../module/helpers/ranges.mjs";

before(() => stubFoundry());
after(() => unstubFoundry());

describe("what the scene says it measures in", () => {

  test("the ways a scene writes metres", () => {
    for (const units of ["m", "M", "meter", "meters", "metre", "metres", " m ", "m."]) {
      assert.equal(isMetric(units), true, JSON.stringify(units));
    }
  });

  test("and the ways it writes feet", () => {
    for (const units of ["ft", "ft.", "feet", "foot", "FT"]) {
      assert.equal(isMetric(units), false, JSON.stringify(units));
      assert.equal(knownUnits(units), true, JSON.stringify(units));
    }
  });

  /* The common case rather than a broken one: grid units default to whatever
   * the system manifest declares, and a system declaring none leaves every new
   * scene with an empty string. */
  test("a scene that says nothing is not pretending to be recognised", () => {
    assert.equal(knownUnits(""), false);
    assert.equal(knownUnits(undefined), false);
    assert.equal(knownUnits("squares"), false);
    // Still read as feet, so something is drawn rather than nothing.
    assert.equal(isMetric(""), false);
  });
});

describe("the four bands", () => {

  test("the book's feet, innermost first", () => {
    assert.deepEqual(bands("ft").map(b => [b.key, b.distance]),
      [["Close", 10], ["Short", 50], ["Long", 100], ["VeryLong", 500]]);
  });

  /* The book's own roundings, not conversions: 10 feet is 3.048 metres and the
   * book says 3. A converted table would print numbers no metric table says. */
  test("and the book's metres, which are not those feet converted", () => {
    assert.deepEqual(bands("m").map(b => b.distance), [3, 15, 30, 150]);
  });

  test("each one carries the name the book leads with", () => {
    assert.deepEqual(bands("ft").map(b => b.name),
      ["ISUN.RangeClose", "ISUN.RangeNear", "ISUN.RangeFar", "ISUN.RangeVeryFar"]);
  });

  test("and a colour to draw it in", () => {
    assert.equal(bands("ft").every(b => Number.isInteger(b.colour)), true);
  });
});

describe("what a pixel is worth", () => {

  test("a hundred pixels to five feet is twenty a foot", () => {
    assert.equal(pixelsPerUnit({ size: 100, distance: 5 }), 20);
  });

  /* A gridless scene still measures by these two numbers, so the ratio holds
   * there exactly as it does on a square grid. */
  test("one unit to a hundred pixels", () => {
    assert.equal(pixelsPerUnit({ size: 100, distance: 1 }), 100);
  });

  test("a scene that cannot answer gets no answer", () => {
    assert.equal(pixelsPerUnit({ size: 100, distance: 0 }), null);
    assert.equal(pixelsPerUnit({ size: 0, distance: 5 }), null);
    assert.equal(pixelsPerUnit({ size: 100 }), null);
    assert.equal(pixelsPerUnit(null), null);
  });
});

describe("the rings that get drawn", () => {

  test("each band's distance in pixels", () => {
    // 100px to 5ft: close is 10ft, so 200px.
    const found = rings({ size: 100, distance: 5 }, "ft");
    assert.deepEqual(found.map(r => r.radius), [200, 1000, 2000, 10000]);
  });

  test("metres scale off the metric table", () => {
    // 100px to 5m: close is 3m, so 60px.
    const found = rings({ size: 100, distance: 5 }, "m");
    assert.deepEqual(found.map(r => r.radius), [60, 300, 600, 3000]);
  });

  test("they come innermost first, so a drawer can paint them back to front", () => {
    const found = rings({ size: 100, distance: 5 }, "ft");
    assert.deepEqual(found.map(r => r.key), ["Close", "Short", "Long", "VeryLong"]);
  });

  /* Nothing rather than NaN. A ring of NaN draws as nothing while looking like
   * a fault somewhere else entirely. */
  test("a scene that cannot say what a pixel is worth gets no rings", () => {
    assert.deepEqual(rings({ size: 100, distance: 0 }, "ft"), []);
    assert.deepEqual(rings(null, "ft"), []);
  });
});

describe("which band a distance falls in", () => {

  test("touching, and a few steps away", () => {
    assert.equal(bandAt(0, "ft").key, "Close");
    assert.equal(bandAt(9, "ft").key, "Close");
  });

  /* The book's numbers are its boundaries — "a distance of 10 to 50 feet" — so
   * a thing exactly 50 away is near, which is the band whose sentence names it. */
  test("a boundary belongs to the band that names it", () => {
    assert.equal(bandAt(10, "ft").key, "Close");
    assert.equal(bandAt(50, "ft").key, "Short");
    assert.equal(bandAt(100, "ft").key, "Long");
    assert.equal(bandAt(500, "ft").key, "VeryLong");
  });

  test("beyond very far is beyond the categories", () => {
    assert.equal(bandAt(501, "ft"), null);
  });

  test("metres answer off their own table", () => {
    assert.equal(bandAt(3, "m").key, "Close");
    assert.equal(bandAt(16, "m").key, "Long");
    assert.equal(bandAt(151, "m"), null);
  });

  test("a distance that is not one is not a band", () => {
    assert.equal(bandAt(-1, "ft"), null);
    assert.equal(bandAt(NaN, "ft"), null);
    assert.equal(bandAt(undefined, "ft"), null);
  });
});
