/**
 * Invisible Sun — the guide's reckoning
 *
 * Three things here are worth a test and the prose is not one of them.
 *
 * Who sees which page, because a GM-only chapter leaking to a player would
 * offer them a button that writes world packs they cannot write. What a
 * compendium's count is compared against, because a made-up denominator on the
 * one screen a new GM reads is worse than no denominator at all. And which page
 * the window opens on, which is the whole of the design: the importer while
 * there is importing to do, and the tour once there is not.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  EDITION, CHAPTERS, chaptersFor, packTargets, importStatus,
  startPage, shouldAutoShow, shouldNudge, clampPage
} from "../../module/helpers/guide.mjs";

/* The decks, roughly as sources.mjs declares them: two feeding one pack, one
 * with no count of its own, and a book that names a pack but promises nothing. */
const SOURCES = [
  { key: "sooth", pack: "invisible-sun.sooth", expected: 60 },
  { key: "spell", pack: "invisible-sun.spells", expected: 300 },
  { key: "spell-m", pack: "invisible-sun.spells", expected: 40 },
  { key: "gate", pack: "invisible-sun.sooth" },
  { key: "key", parts: { heart: { pack: "invisible-sun.hearts" } } },
  { key: "teratology", expected: 246, parts: { creature: { pack: "invisible-sun.creatures" } } }
];

const packs = (...rows) => rows.map(([id, label, count]) => ({ id, label, count }));

describe("who reads what", () => {

  test("the books page is the GM's alone", () => {
    const gm = chaptersFor(true).map(c => c.id);
    const player = chaptersFor(false).map(c => c.id);

    assert.equal(gm[0], "books", "the GM is greeted by the one job only they can do");
    assert.ok(!player.includes("books"),
      "a player cannot write world packs, so must not be offered the importer");
    // Otherwise the two read the same guide, in the same order.
    assert.deepEqual(gm.slice(1), player);
  });

  /* The rolling page tells the GM to name the pool an action draws on, which
   * is a field no player ever sets. */
  test("a chapter may address one audience without excluding the other", () => {
    const rolling = id => chaptersFor(id).find(c => c.id === "rolling");
    assert.ok(rolling(true).body.includes("ISUN.GuideRollingGM"));
    assert.ok(!rolling(false).body.includes("ISUN.GuideRollingGM"));
    assert.ok(rolling(false).body.length >= 3, "the page still reads without it");
  });

  test("the welcome says a different second half to each", () => {
    const gm = chaptersFor(true).find(c => c.id === "welcome");
    const player = chaptersFor(false).find(c => c.id === "welcome");

    assert.ok(gm.body.includes("ISUN.GuideWelcomeGM"));
    assert.ok(!gm.body.includes("ISUN.GuideWelcomePlayer"));
    assert.ok(player.body.includes("ISUN.GuideWelcomePlayer"));
    assert.ok(!player.body.includes("ISUN.GuideWelcomeGM"));
  });

  /* The chapter list is module state and a render is not the last one. Folding
   * the audience's paragraphs in by mutation would add one to every page on
   * every pass, which is invisible until the fourth read is four copies long. */
  test("reading it twice does not lengthen it", () => {
    const first = chaptersFor(true).find(c => c.id === "welcome").body.length;
    chaptersFor(true);
    const again = chaptersFor(true).find(c => c.id === "welcome").body.length;
    assert.equal(again, first);
  });

  test("every chapter is addressable and every paragraph is a key", () => {
    const ids = CHAPTERS.map(c => c.id);
    assert.equal(new Set(ids).size, ids.length, "two chapters share an id");

    for (const c of CHAPTERS) {
      const keys = [...c.body, ...(c.bodyGM ?? []), ...(c.bodyPlayer ?? []), c.title];
      for (const key of keys) {
        assert.match(key, /^ISUN\./, `${c.id} has a paragraph that is not a key`);
      }
    }
  });

  test("a link goes somewhere, and says where in a key", () => {
    for (const c of CHAPTERS) {
      if (!c.link) continue;
      assert.match(c.link.href, /^https:\/\//, `${c.id} links somewhere insecure or relative`);
      assert.match(c.link.label, /^ISUN\./, `${c.id} has a hardcoded link label`);
    }
  });

  /* apps/Guide.mjs resolves this string to a window, and a chapter naming one
   * that does not exist loses its button silently. The list is short enough to
   * be repeated here, and repeating it is what makes the typo loud. */
  test("a chapter only opens a window that exists", () => {
    const known = new Set(["importer", "pathOfSuns", "browser"]);
    for (const c of CHAPTERS) {
      if (!c.opens) continue;
      assert.ok(known.has(c.opens), `${c.id} opens an unknown window: ${c.opens}`);
      assert.ok(c.opensLabel, `${c.id} offers a button with no label`);
      assert.ok(c.opensIcon, `${c.id} offers a button with no icon`);
    }
  });
});

describe("what a compendium is measured against", () => {

  test("two decks feeding one pack are one target", () => {
    assert.equal(packTargets(SOURCES)["invisible-sun.spells"], 340);
  });

  test("a book promises nothing, even where it names a pack", () => {
    // The Gate writes into the sooth pack but declares no count; only the deck's
    // sixty may be claimed.
    assert.equal(packTargets(SOURCES)["invisible-sun.sooth"], 60);
  });

  /* Teratology has an `expected`, but it counts what the book yields rather
   * than what the compendium should hold, and it has no top-level pack to
   * attribute it to. Claiming it for Creatures would print a total nobody
   * could reach. */
  test("a book's own page count is not a compendium's target", () => {
    assert.equal(packTargets(SOURCES)["invisible-sun.creatures"], undefined);
    assert.equal(packTargets(SOURCES)["invisible-sun.hearts"], undefined);
  });

  test("nothing in, nothing out", () => {
    assert.deepEqual(packTargets([]), {});
    assert.deepEqual(packTargets(), {});
  });
});

describe("what is in the compendia", () => {

  test("empty, part-read and done", () => {
    const { rows } = importStatus(SOURCES, packs(
      ["invisible-sun.sooth", "Sooth Deck", 0],
      ["invisible-sun.spells", "Spells", 300],
      ["invisible-sun.hearts", "Hearts", 12]
    ));
    assert.deepEqual(rows.map(r => r.state), ["empty", "partial", "full"]);
  });

  test("a pack with no target is full once it holds anything", () => {
    const [row] = importStatus(SOURCES, packs(["invisible-sun.hearts", "Hearts", 1])).rows;
    assert.equal(row.expected, null);
    assert.equal(row.target, null);
    assert.equal(row.state, "full");
  });

  /* Live data caught this one. The deck targets count what the decks provide,
   * and books write into the same packs — so a finished Ephemera compendium
   * holds 307 against a deck target of 293, and printing "307 / 293" told a GM
   * who had imported everything correctly that something had gone wrong. */
  test("a target is shown while it is unmet and withdrawn once it is passed", () => {
    const [short, met, over] = importStatus(SOURCES, packs(
      ["invisible-sun.sooth", "Sooth Deck", 12],
      ["invisible-sun.spells", "Spells", 340],
      ["invisible-sun.ephemera", "Ephemera", 307]
    ).concat()).rows;

    assert.equal(short.target, 60, "a pack still filling says what it is filling to");
    assert.equal(met.target, null, "a pack that has arrived does not need the sum");
    assert.equal(over.target, null);
    // The reckoning itself is untouched; only what is printed changes.
    assert.equal(short.expected, 60);
    assert.equal(met.expected, 340);
  });

  test("meeting the target is done, and passing it is not a fault", () => {
    const { rows } = importStatus(SOURCES, packs(
      ["invisible-sun.sooth", "Sooth Deck", 60],
      ["invisible-sun.spells", "Spells", 341]
    ));
    assert.deepEqual(rows.map(r => r.state), ["full", "full"]);
  });

  /* "Started" is the only honest question. Which books somebody owns is not
   * knowable, so a world that will never fill Vance Spells must not be read as
   * a world that has never imported. */
  test("one full compendium is an import that happened", () => {
    const none = importStatus(SOURCES, packs(
      ["invisible-sun.sooth", "Sooth Deck", 0],
      ["invisible-sun.spells", "Spells", 0]
    ));
    assert.equal(none.started, false);
    assert.equal(none.filled, 0);
    assert.equal(none.total, 2);

    const some = importStatus(SOURCES, packs(
      ["invisible-sun.sooth", "Sooth Deck", 60],
      ["invisible-sun.spells", "Spells", 0]
    ));
    assert.equal(some.started, true);
    assert.equal(some.filled, 1);
  });

  test("a world with no packs at all is not an import that happened", () => {
    const empty = importStatus(SOURCES, []);
    assert.equal(empty.started, false);
    assert.deepEqual(empty.rows, []);
  });

  test("a count that is not a number counts as none", () => {
    const { rows, started } = importStatus(SOURCES, [
      { id: "invisible-sun.sooth", label: "Sooth Deck", count: undefined }
    ]);
    assert.equal(rows[0].count, 0);
    assert.equal(started, false);
  });
});

describe("which page it opens on", () => {

  test("the importer, while there is importing to do", () => {
    const chapters = chaptersFor(true);
    assert.equal(startPage(chapters, { importStarted: false }), 0);
    assert.equal(chapters[0].id, "books");
  });

  test("and the tour, once there is not", () => {
    const chapters = chaptersFor(true);
    assert.equal(chapters[startPage(chapters, { importStarted: true })].id, "welcome");
  });

  /* The books page is the only task, so every later page is reading and none of
   * them may claim the greeting from it. */
  test("only one page is ever a job to be done", () => {
    assert.deepEqual(CHAPTERS.filter(c => c.attention).map(c => c.id), ["books"]);
  });

  test("a player has no task, so they start at the beginning", () => {
    const chapters = chaptersFor(false);
    assert.equal(startPage(chapters, { importStarted: false }), 0);
    assert.equal(chapters[0].id, "welcome");
  });

  /* An unknown state is not an emergency. A caller that forgot to say whether
   * the import had run should get the reading order, not a page insisting on a
   * job it cannot show is outstanding. */
  test("an unstated import is not an outstanding one", () => {
    const chapters = chaptersFor(true);
    assert.equal(chapters[startPage(chapters, {})].id, "welcome");
    assert.equal(chapters[startPage(chapters)].id, "welcome");
  });

  test("no chapters, no page", () => {
    assert.equal(startPage([], { importStarted: false }), 0);
  });
});

describe("opening unasked, and staying shut", () => {

  test("shows by default and stops when told", () => {
    const chapters = chaptersFor(true);
    assert.equal(shouldAutoShow({ auto: true, chapters }), true);
    assert.equal(shouldAutoShow({ auto: false, chapters }), false);
  });

  /* The checkbox is the only gate, deliberately. A second condition — seen it
   * once, seen this edition — is what would make the footer's promise untrue in
   * some case nobody finds until it annoys them. */
  test("nothing else gates it", () => {
    assert.equal(shouldAutoShow({ auto: true, chapters: chaptersFor(false) }), true);
  });

  test("an empty guide opens on nothing", () => {
    assert.equal(shouldAutoShow({ auto: true, chapters: [] }), false);
    assert.equal(shouldAutoShow(), false);
  });

  test("the edition is a whole number that only ever rises", () => {
    assert.ok(Number.isInteger(EDITION) && EDITION >= 1);
  });
});

describe("telling somebody who switched it off", () => {

  test("nobody who still gets the window gets the line as well", () => {
    assert.equal(shouldNudge({ auto: true, seen: 0, told: 0, edition: 2 }), false);
  });

  test("a reader who stopped at an older edition hears about the new one", () => {
    assert.equal(shouldNudge({ auto: false, seen: 1, told: 0, edition: 2 }), true);
  });

  test("and hears about it exactly once", () => {
    assert.equal(shouldNudge({ auto: false, seen: 1, told: 2, edition: 2 }), false);
  });

  test("a reader who is up to date is left alone", () => {
    assert.equal(shouldNudge({ auto: false, seen: 2, told: 0, edition: 2 }), false);
    assert.equal(shouldNudge({ auto: false, seen: 3, told: 0, edition: 2 }), false);
  });

  /* Two facts, deliberately not one. Stamping `seen` on a nudge would record a
   * reading that never happened and bury every later edition behind it. */
  test("being told is not the same as having read", () => {
    // Told about edition 2 but never opened it: edition 3 must still reach them.
    assert.equal(shouldNudge({ auto: false, seen: 1, told: 2, edition: 3 }), true);
  });

  test("a setting that came back as nothing is treated as never", () => {
    assert.equal(shouldNudge({ auto: false, seen: undefined, told: null, edition: 1 }), true);
    assert.equal(shouldNudge({ auto: false, seen: NaN, told: NaN, edition: 1 }), true);
  });

  /* The window and the line are the two halves of one greeting, and a reader
   * must never get both or neither for the same state. */
  test("exactly one greeting, whatever the state", () => {
    const chapters = chaptersFor(true);
    for (const auto of [true, false]) {
      for (const seen of [0, 1, 2, 3]) {
        for (const told of [0, 1, 2, 3]) {
          const window = shouldAutoShow({ auto, chapters });
          const line = shouldNudge({ auto, seen, told, edition: 2 });
          assert.ok(!(window && line),
            `both fired for auto=${auto} seen=${seen} told=${told}`);
        }
      }
    }
  });
});

describe("turning the pages", () => {

  test("neither end runs off", () => {
    assert.equal(clampPage(-3, 2), 0);
    assert.equal(clampPage(9, 2), 1);
    assert.equal(clampPage(1, 2), 1);
  });

  test("a book of nothing is still on page nought", () => {
    assert.equal(clampPage(4, 0), 0);
  });

  test("nonsense lands on the first page rather than throwing", () => {
    assert.equal(clampPage(NaN, 3), 0);
    assert.equal(clampPage(undefined, 3), 0);
    assert.equal(clampPage(1.7, 3), 1);
  });
});
