/**
 * Invisible Sun — the Path of Suns rules
 *
 * `helpers/sooth.mjs` is where the board's arithmetic lives, and three call
 * sites read it: the board draws it, the answer dialog adds it to a roll, and
 * the vislae sheet badges spells with it. Two of those had grown their own copy
 * before it was factored out, and the copies had drifted — so what is asserted
 * here is not incidental, it is the thing the whole feature agrees on.
 *
 * Most of it is a reading of the books rather than an obvious consequence of
 * them. Where that is so, the case says which rule and which page, and a
 * failure should be read as "this ruling changed" rather than "the code broke".
 *
 * Run with `npm test`, or on its own with `node --test scripts/test/`.
 */
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { stubFoundry, unstubFoundry, card, boardOf, vislae } from "./foundry-stub.mjs";

/* The module reads CONFIG at call time, so the globals have to exist before it
 * is imported — a static import at the top of the file would be evaluated
 * first. */
let sooth;
before(async () => {
  stubFoundry();
  sooth = await import("../../module/helpers/sooth.mjs");
});
after(() => unstubFoundry());

/** Re-stub between cases, so no board or setting survives into the next. */
const world = (options) => stubFoundry(options);

/* ──────────────────────────────────────────────
 * The board
 * ────────────────────────────────────────────── */

describe("the shape of the Path", () => {
  beforeEach(() => world());

  test("runs the eight suns in order and ends off the Path", () => {
    assert.deepEqual(sooth.board({ nightside: false }),
      ["silver", "green", "blue", "indigo", "grey", "pale", "red", "gold", "invisible"]);
  });

  test("the Nightside is that reversed, still ending on the Invisible Sun", () => {
    // "Nightside Path: The Path of Suns in reverse" (The Gate, p10956). The
    // Invisible Sun "presides over" the Path rather than sitting on it, so it
    // is last either way.
    assert.deepEqual(sooth.board({ nightside: true }),
      ["gold", "red", "pale", "grey", "indigo", "blue", "green", "silver", "invisible"]);
  });

  test("a sun holds only the last card played on it", () => {
    const first = card({ name: "First" });
    const second = card({ name: "Second" });
    const state = boardOf([[first, "silver"], [second, "silver"]]);
    assert.equal(sooth.slots(state).get("silver").name, "Second");
    assert.equal(sooth.slots(state).size, 1);
  });

  test("the next card goes on the next sun, and wraps after the Invisible", () => {
    assert.equal(sooth.nextSun({ history: [] }), "silver");
    assert.equal(sooth.nextSun(boardOf([[card(), "silver"]])), "green");
    assert.equal(sooth.nextSun(boardOf([[card(), "gold"]])), "invisible");
    assert.equal(sooth.nextSun(boardOf([[card(), "invisible"]])), "silver");
  });
});

describe("what is in play", () => {
  beforeEach(() => world());

  test("only the newest card, and whatever holds the Invisible Sun", () => {
    /* "The most recently turned card is the active card, and any effects of the
     * previous card are now canceled. The only exception is that a card played
     * on the Invisible Sun goes into the Testament of Suns and remains in
     * effect until a new card is played on the Invisible Sun" (The Gate, p73). */
    const kept = card({ name: "Testament" });
    const old = card({ name: "Spent" });
    const now = card({ name: "Active" });
    const state = boardOf([[kept, "invisible"], [old, "silver"], [now, "green"]]);

    assert.deepEqual(sooth.live(state).map(e => e.name), ["Active", "Testament"]);
    assert.equal(sooth.active(state).name, "Active");
    assert.equal(sooth.testament(state).name, "Testament");
  });

  test("a card played on the Invisible Sun is both at once, and listed once", () => {
    const state = boardOf([[card({ name: "Only" }), "invisible"]]);
    assert.deepEqual(sooth.live(state).map(e => e.name), ["Only"]);
  });
});

/* ──────────────────────────────────────────────
 * What a card does to magic
 * ────────────────────────────────────────────── */

describe("the sun shifts", () => {
  let maze;
  beforeEach(() => {
    maze = card({ name: "Maze", family: "secrets", enhanced: "Blue", diminished: "Red" });
    world();
  });

  test("one up and one down, off its own sun", () => {
    const state = boardOf([[maze, "silver"]]);
    const cards = sooth.lookup([maze], state);
    assert.deepEqual(sooth.spellEffect("Blue", state, cards),
      { amount: 1, doubled: false, sources: "Maze" });
    assert.deepEqual(sooth.spellEffect("Red", state, cards),
      { amount: -1, doubled: false, sources: "Maze" });
  });

  test("doubled on the sun it enhances", () => {
    // "Cards affecting magic of a particular color sun double the effect when
    // played on that sun in the Path" (The Gate, p74).
    const state = boardOf([[maze, "blue"]]);
    const cards = sooth.lookup([maze], state);
    assert.deepEqual(sooth.spellEffect("Blue", state, cards),
      { amount: 2, doubled: true, sources: "Maze" });
    // The sun it diminishes is not the sun it sits on, so that half is not.
    assert.equal(sooth.spellEffect("Red", state, cards).doubled, false);
  });

  test("doubled on the sun it diminishes, too", () => {
    const state = boardOf([[maze, "red"]]);
    const cards = sooth.lookup([maze], state);
    assert.deepEqual(sooth.spellEffect("Red", state, cards),
      { amount: -2, doubled: true, sources: "Maze" });
  });

  test("two cards on one sun are summed, not listed", () => {
    const other = card({ name: "Other", enhanced: "Blue", diminished: "Gold" });
    const state = boardOf([[other, "invisible"], [maze, "silver"]]);
    const cards = sooth.lookup([maze, other], state);
    const blue = sooth.spellEffect("Blue", state, cards);
    assert.equal(blue.amount, 2);
    assert.match(blue.sources, /Maze/);
    assert.match(blue.sources, /Other/);
  });

  test("an enhancement cancelling a diminishment leaves the sun out of it", () => {
    const against = card({ name: "Against", enhanced: "Red", diminished: "Blue" });
    const state = boardOf([[against, "invisible"], [maze, "silver"]]);
    const cards = sooth.lookup([maze, against], state);
    assert.equal(sooth.spellEffect("Blue", state, cards).amount, 0);
    assert.equal(sooth.spellEffect("Red", state, cards).amount, 0);
    assert.equal(sooth.sunTotals(state, cards).size, 0);
  });

  test("a colour that is not a sun is never shifted", () => {
    // A few cards print "Varies" rather than a sun, so a spell can hold it.
    const state = boardOf([[maze, "blue"]]);
    const cards = sooth.lookup([maze], state);
    assert.equal(sooth.spellEffect("Varies", state, cards).amount, 0);
    assert.equal(sooth.spellEffect("", state, cards).amount, 0);
  });

  test("royalty cards shift no sun at all", () => {
    // "A royalty card shifts no sun; it carries a special effect" (The Key,
    // p6110) — all 24 of them, which is why this is not an omission.
    const sovereign = card({ name: "Sovereign", rank: "sovereign", family: "visions" });
    const state = boardOf([[sovereign, "green"]]);
    const cards = sooth.lookup([sovereign], state);
    assert.equal(sooth.sunTotals(state, cards).size, 0);
  });
});

/* ──────────────────────────────────────────────
 * What a card does to a character
 * ────────────────────────────────────────────── */

describe("the venture a card is worth", () => {
  const worth = async (family, board, deck) => {
    world({ board, deck });
    return sooth.ventureFor(vislae(family));
  };

  test("a card of your heart's family is +1", async () => {
    // "If a card is played from the card family associated with a character's
    // heart… all of that character's actions get a +1 bonus" (The Gate, p74).
    const secrets = card({ name: "Secrets Card", family: "secrets" });
    const result = await worth("Secrets", boardOf([[secrets, "silver"]]), [secrets]);
    assert.equal(result.value, 1);
    assert.deepEqual(result.sources, ["Secrets Card +1"]);
  });

  test("and nothing to anyone else", async () => {
    const secrets = card({ family: "secrets" });
    const result = await worth("Mysteries", boardOf([[secrets, "silver"]]), [secrets]);
    assert.equal(result.value, 0);
  });

  test("the family is matched whatever its casing", async () => {
    // Hearts store "Secrets"; cards store "secrets".
    const secrets = card({ family: "secrets" });
    const board = boardOf([[secrets, "silver"]]);
    assert.equal((await worth("secrets", board, [secrets])).value, 1);
    assert.equal((await worth("SECRETS", board, [secrets])).value, 1);
  });

  test("a vislae with no heart yet collects nothing from the family rule", async () => {
    const secrets = card({ family: "secrets" });
    const result = await worth("", boardOf([[secrets, "silver"]]), [secrets]);
    assert.equal(result.value, 0);
  });

  test("an empty board is worth nothing", async () => {
    assert.deepEqual(await worth("Secrets", boardOf([]), []), { value: 0, sources: [] });
  });
});

describe("the royalty cards", () => {
  /* Each row is the card as The Gate prints it (p74), and what it is worth to a
   * heart of its own family and to everyone else.
   *
   * ── The ruling this table encodes ──
   * A royalty card that names a number for a linked heart states the *whole*
   * answer for that heart; the general family +1 is not added underneath it.
   * The books do not say so outright, and the deduction is this:
   *
   *   Nemesis is "−1 to all actions, −2 if heart is linked to family". Add the
   *   +1 and a linked heart sits at −1 — exactly where everyone else is, so the
   *   "−2" clause changes nothing for anybody. Apprentice is "−1 to all actions
   *   if heart is linked to family": add the +1 and it comes to zero, and the
   *   card does nothing at all. Two of the six, both of them the penalties,
   *   would be void.
   *
   * Where the card names no action modifier — Adept and Companion say only that
   * another card is turned — the general rule still applies and a linked heart
   * takes its +1. */
  const ROYALTY = [
    { rank: "sovereign",  linked:  2, others:  1 },
    { rank: "nemesis",    linked: -2, others: -1 },
    { rank: "defender",   linked:  2, others:  0 },
    { rank: "apprentice", linked: -1, others:  0 },
    { rank: "companion",  linked:  1, others:  0 },
    { rank: "adept",      linked:  1, others:  0 }
  ];

  for (const { rank, linked, others } of ROYALTY) {
    test(`${rank}: ${linked} to a linked heart, ${others} to everyone else`, async () => {
      const royal = card({ name: rank, family: "visions", rank });
      const board = boardOf([[royal, "silver"]]);
      world({ board, deck: [royal] });

      assert.equal((await sooth.ventureFor(vislae("Visions"))).value, linked,
        `${rank} to a linked heart`);
      assert.equal((await sooth.ventureFor(vislae("Notions"))).value, others,
        `${rank} to an unlinked heart`);
    });
  }

  test("a Nemesis reaches a vislae with no heart at all", async () => {
    const devil = card({ name: "Devil", family: "secrets", rank: "nemesis" });
    world({ board: boardOf([[devil, "silver"]]), deck: [devil] });
    assert.equal((await sooth.ventureFor(vislae(""))).value, -1);
  });

  test("the source names the card, so a player can see where it came from", async () => {
    const devil = card({ name: "Devil", family: "secrets", rank: "nemesis" });
    world({ board: boardOf([[devil, "silver"]]), deck: [devil] });
    assert.deepEqual((await sooth.ventureFor(vislae("Secrets"))).sources, ["Devil −2"]);
  });
});

/* ──────────────────────────────────────────────
 * Turning cards
 * ────────────────────────────────────────────── */

describe("a card turn", () => {
  beforeEach(() => world());

  test("plays one card, on the next sun", () => {
    const deck = [card(), card(), card()];
    const { state, placed } = sooth.turn({ version: 1, history: [], nightside: false }, deck);
    assert.equal(placed.length, 1);
    assert.equal(placed[0].sun, "silver");
    assert.equal(state.history.length, 1);
  });

  test("never plays a card twice in a pass", () => {
    const deck = [card(), card(), card()];
    let state = { version: 1, history: [], nightside: false };
    for (let i = 0; i < 3; i++) state = sooth.turn(state, deck).state;

    assert.equal(sooth.remaining(state, deck).length, 0);
    assert.equal(new Set(state.history.map(e => e.uuid)).size, 3);
    assert.deepEqual(sooth.turn(state, deck).placed, []);
  });

  /* ── Why these decks are uniform ──
   * `turn` draws at random from what is left, deliberately: a stored shuffle
   * goes stale the moment the pack is re-imported. So a test cannot say "the
   * Adept is drawn first" — it says "every card is an Adept", and then what is
   * drawn does not matter. A deck of one kind is the only deterministic way to
   * ask what that kind does. */

  test("a plain card turns one and stops", () => {
    const deck = [card(), card(), card()];
    const { placed } = sooth.turn({ version: 1, history: [], nightside: false }, deck);
    assert.equal(placed.length, 1);
  });

  test("an Adept turns the next card itself", () => {
    // "Adept: Play another card on the next sun" (The Gate, p74).
    const deck = [card({ rank: "adept" }), card({ rank: "adept" }), card({ rank: "adept" })];
    const { placed } = sooth.turn({ version: 1, history: [], nightside: false }, deck);

    assert.equal(placed.length, 3, "each Adept drags the next, until the deck runs out");
    assert.deepEqual(placed.map(p => p.sun), ["silver", "green", "blue"]);
  });

  test("a Companion turned first drags one after it, having nothing to copy", () => {
    /* "Companion: Duplicates the effects of the previously played card (if
     * played first in a session on the Silver Sun, immediately play another
     * card on the next sun)" (The Gate, p74). The parenthesis is the whole
     * point: with nothing behind it, it has nothing to duplicate.
     *
     * Two Companions, so the draw order cannot matter: the first chains because
     * it is first, and the second duplicates it and stops. */
    const deck = [card({ rank: "companion" }), card({ rank: "companion" })];
    const { placed } = sooth.turn({ version: 1, history: [], nightside: false }, deck);
    assert.equal(placed.length, 2);
  });

  test("a Companion turned later duplicates instead, and drags nothing", () => {
    const deck = [card({ rank: "companion" }), card({ rank: "companion" })];
    const state = boardOf([[card({ name: "First" }), "silver"]]);
    const { placed } = sooth.turn(state, deck);
    assert.equal(placed.length, 1, "there is a card behind it, so it copies rather than chains");
  });

  test("a chain stops when the deck does", () => {
    const { placed } = sooth.turn({ version: 1, history: [], nightside: false },
      [card({ rank: "adept" })]);
    assert.equal(placed.length, 1, "there is nothing left for it to turn");
  });
});

describe("a Companion's effects", () => {
  beforeEach(() => world());

  test("are the previous card's, read at the previous card's position", () => {
    /* It duplicates effects, and the doubling was decided by where the card it
     * copies was sitting — so the position travels with the effect. Maze on the
     * Blue Sun is doubled; the Companion beside it repeats that, rather than
     * being read at the sun the Companion itself landed on. */
    const maze = card({ name: "Maze", family: "secrets", enhanced: "Blue", diminished: "Red" });
    const companion = card({ name: "Companion", family: "notions", rank: "companion" });
    const state = boardOf([[maze, "blue"], [companion, "indigo"]]);
    const cards = sooth.lookup([maze, companion], state);

    const blue = sooth.spellEffect("Blue", state, cards);
    assert.equal(blue.amount, 2, "still doubled, from the Blue Sun");
    assert.equal(blue.doubled, true);
    assert.equal(blue.sources, "Maze", "attributed to the card being copied");
  });

  test("but the family bonus is its own, since it is the card on the table", async () => {
    const maze = card({ name: "Maze", family: "secrets", enhanced: "Blue" });
    const companion = card({ name: "Companion", family: "notions", rank: "companion" });
    const board = boardOf([[maze, "blue"], [companion, "indigo"]]);
    world({ board, deck: [maze, companion] });

    assert.equal((await sooth.ventureFor(vislae("Notions"))).value, 1,
      "the Companion's own family is what is showing");
    assert.equal((await sooth.ventureFor(vislae("Secrets"))).value, 0,
      "the card it copies is no longer the card played");
  });
});

/* ──────────────────────────────────────────────
 * Sessions
 * ────────────────────────────────────────────── */

describe("across sessions", () => {
  beforeEach(() => world());

  test("a new session clears the Path but keeps the Testament", () => {
    /* "GMs can, if they wish, pick up where one session left off, or simply
     * start over at the beginning of each session on the Silver Sun" (The Gate,
     * p74). A card on the Invisible Sun stays in effect until another is played
     * there, and a new session does not play one. */
    const kept = card({ name: "Testament" });
    const spent = card({ name: "Spent" });
    const state = sooth.newSession(boardOf([[kept, "invisible"], [spent, "silver"]]));

    assert.equal(state.history.length, 1);
    assert.equal(sooth.testament(state).name, "Testament");
    assert.equal(sooth.slots(state).has("silver"), false);
    assert.equal(sooth.nextSun(state), "silver", "the Path starts again");
  });

  test("the card held over does not count as this session's first", () => {
    /* So a Companion turned first still has nothing to duplicate: the Testament
     * is in play on its own account, and copying it would count it twice.
     * A uniform deck again, for the reason given above. */
    const state = sooth.newSession(boardOf([[card({ name: "Testament" }), "invisible"]]));
    const deck = [card({ rank: "companion" }), card({ rank: "companion" })];

    const { placed } = sooth.turn(state, deck);
    assert.equal(placed.length, 2, "it drags a card, rather than copying the Testament");
  });

  test("a shuffle returns the spent pile and leaves the board showing", () => {
    const a = card({ name: "A" }), b = card({ name: "B" }), c = card({ name: "C" });
    const deck = [a, b, c];
    // A and B both played on Silver: A is spent, B is what shows.
    const state = sooth.reshuffle(boardOf([[a, "silver"], [b, "silver"], [c, "green"]]));

    assert.equal(sooth.slots(state).get("silver").name, "B", "the board is unchanged");
    assert.equal(sooth.slots(state).get("green").name, "C");
    assert.equal(sooth.remaining(state, deck).length, 1, "A went back to the deck");
  });

  test("taking a card back is a pop", () => {
    const a = card({ name: "A" }), b = card({ name: "B" });
    const state = sooth.undo(boardOf([[a, "silver"], [b, "green"]]));
    assert.equal(state.history.length, 1);
    assert.equal(sooth.active(state).name, "A");
  });
});

/* ──────────────────────────────────────────────
 * The table's switch
 * ────────────────────────────────────────────── */

describe("the automation setting", () => {
  test("off means nothing reaches a roll", async () => {
    // "The Sooth Deck is a tool, not an obligation" (The Gate, p73). A table
    // that would rather apply the modifiers themselves turns this off.
    const secrets = card({ family: "secrets" });
    world({ automated: false, board: boardOf([[secrets, "silver"]]), deck: [secrets] });
    assert.deepEqual(await sooth.ventureFor(vislae("Secrets")), { value: 0, sources: [] });
  });

  test("off still shows what the board is doing to magic", async () => {
    /* The setting governs the dice, not the display: a board nobody automates
     * is still a board everybody reads. */
    const maze = card({ enhanced: "Blue", diminished: "Red" });
    world({ automated: false, board: boardOf([[maze, "blue"]]), deck: [maze] });
    const shifts = await sooth.spellShifts();
    assert.equal(shifts.blue.amount, 2);
    assert.equal(shifts.blue.doubled, true);
  });
});

/* ──────────────────────────────────────────────
 * Reading a board whose deck has moved on
 * ────────────────────────────────────────────── */

describe("matching a board to a deck", () => {
  beforeEach(() => world());

  test("a card is found by uuid", () => {
    const c = card({ name: "Found" });
    const found = sooth.lookup([c], boardOf([[c, "silver"]]));
    assert.equal(found.get(c.uuid).name, "Found");
  });

  test("and by name when the pack has been rebuilt under it", () => {
    /* Ids survive a re-import, because the importer updates what is already
     * there — but not a pack rebuilt from scratch. A board that outlived its
     * deck would otherwise point at nothing, and the picture would vanish. */
    const original = card({ name: "Endless Maze" });
    const rebuilt = card({ name: "Endless Maze" });
    assert.notEqual(original.uuid, rebuilt.uuid);

    const found = sooth.lookup([rebuilt], boardOf([[original, "silver"]]));
    assert.equal(found.get(original.uuid)?.name, "Endless Maze");
  });

  test("a card that is genuinely gone is simply absent", () => {
    const gone = card({ name: "Gone" });
    const found = sooth.lookup([card({ name: "Other" })], boardOf([[gone, "silver"]]));
    assert.equal(found.has(gone.uuid), false);
  });
});
