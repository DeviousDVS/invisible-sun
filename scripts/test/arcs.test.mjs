/**
 * Invisible Sun — taking a character arc's beat apart
 *
 * Every beat in the book is written the same way: a name, then what it pays,
 * then what happens. "Research. 1 Acumen reward. You look into your own family
 * background…". All three were kept as one string, so the name of a beat
 * existed only as the first words of its prose and no sheet could show it as a
 * name.
 *
 * The cases below are the ones that decide whether a title is a title. A rule
 * this shape gets it right on the common line and wrong on the edges — a
 * sentence with no name in front of it, a name with a number in it, a beat that
 * is nothing but its name — and each of those is in the pack.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { splitBeat } from "../../module/data-models/item/arc-beat.mjs";

describe("naming a beat out of its own prose", () => {

  test("the ordinary line: a name, the reward, then what happens", () => {
    const beat = splitBeat(
      "Research. 1 Acumen reward. You look into your own family background.");
    assert.equal(beat.title, "Research");
    assert.equal(beat.reward, "1 Acumen reward");
    assert.equal(beat.description, "You look into your own family background.");
  });

  test("the reward is dropped from the prose, not from the beat", () => {
    /* It is a field already, so repeating it in the description said the same
     * thing twice on one row of the sheet. */
    const beat = splitBeat("Sharing Your Home. 1 Acumen reward. The child now lives with you.");
    assert.equal(beat.reward, "1 Acumen reward");
    assert.ok(!beat.description.includes("Acumen"), beat.description);
  });

  test("a beat that is only its name and its price", () => {
    // "Beginning the Search. 1 Acumen reward." — 40 of the 191 read like this.
    const beat = splitBeat("Beginning the Search. 1 Acumen reward.");
    assert.equal(beat.title, "Beginning the Search");
    assert.equal(beat.reward, "1 Acumen reward");
    assert.equal(beat.description, "");
  });

  test("a name is written like a name, and prose is not", () => {
    /* Length is not the tell. The book prices some beats after their name and
     * others after their prose, so both are a short sentence followed by a
     * price — and counting characters called twenty resolutions "You
     * contemplate how this new knowledge sits with you". Case separates them:
     * a name is a noun phrase in title case. */
    const prose = splitBeat("You contemplate how this new knowledge sits with you. 1 Acumen reward.");
    assert.equal(prose.title, "");
    assert.equal(prose.description, "You contemplate how this new knowledge sits with you.");
    assert.equal(prose.reward, "1 Acumen reward");

    const named = splitBeat("Sharing Your Home. 1 Acumen reward. The child now lives with you.");
    assert.equal(named.title, "Sharing Your Home");
  });

  test("one capitalised word is a name; the book uses plenty", () => {
    for (const one of ["Research", "Discovery", "Vow", "Completion"]) {
      assert.equal(splitBeat(`${one}. 1 Acumen reward. It happens.`).title, one);
    }
  });

  test("the rules' own nouns are not evidence of a name either", () => {
    /* Acumen, Joy and Despair are capitalised wherever they appear. Fall from
     * Grace's climax ends "There is no Joy reward possibility. Only 1 Despair."
     * — and that first sentence read as title case on account of the Joy. */
    const beat = splitBeat("There is no Joy reward possibility. Only 1 Despair.");
    assert.equal(beat.title, "");
  });

  test("a price inside the prose is not evidence of a name", () => {
    /* "the swearing pays 2 Acumen at once" carries a capital A, which read as
     * title case and made a sentence into a name. */
    const beat = splitBeat("You swear it, and the swearing pays 2 Acumen at once.");
    assert.equal(beat.title, "");
  });

  test("a price that is part of the last sentence stays in it", () => {
    /* "Success results in 1 Joy. Failure results in 1 Despair." ends with a
     * price but is not a price line, and a rule anchored only to the end of the
     * string cut it back to "…Failure results in". */
    const beat = splitBeat("You confront them. Success results in 1 Joy. Failure results in 1 Despair.");
    assert.ok(beat.description.endsWith("Failure results in 1 Despair."), beat.description);
  });

  test("a price after the prose is taken out of it too", () => {
    const beat = splitBeat("You wallow in your own misery. 1 Acumen reward.");
    assert.equal(beat.title, "");
    assert.equal(beat.description, "You wallow in your own misery.");
    assert.equal(beat.reward, "1 Acumen reward");
  });

  test("running it twice changes nothing the second time", () => {
    /* migrateData transforms on read and is not written back, so it can meet
     * its own output. Every shape in the pack, put through twice. */
    for (const raw of [
      "Research. 1 Acumen reward. You look into your own family background.",
      "Beginning the Search. 1 Acumen reward.",
      "1 Acumen reward. You contemplate how this new knowledge sits with you.",
      "You contemplate how this new knowledge sits with you.",
      ""
    ]) {
      const once = splitBeat(raw);
      const twice = splitBeat(once.description);
      assert.equal(twice.title, "", `"${once.description}" gained a name on a second pass`);
    }
  });

  test("Joy and Despair are rewards too", () => {
    const climax = splitBeat("The Reckoning. 1 Despair. It does not go as you hoped.");
    assert.equal(climax.reward, "1 Despair");
    assert.equal(climax.description, "It does not go as you hoped.");
  });

  test("a reward stated mid-sentence is lifted out but left where it stands", () => {
    /* Moving it would break the sentence it belongs to, and the sentence is
     * what the beat actually says. It does not name the beat either: a price
     * buried in the prose is not the price that follows a name. */
    const beat = splitBeat("Vow. You swear it, and the swearing pays 2 Acumen at once.");
    assert.equal(beat.reward, "2 Acumen at once");
    assert.equal(beat.title, "Vow");
    assert.ok(beat.description.includes("2 Acumen"), beat.description);
  });

  test("a beat that leads with its price has no name", () => {
    /* Some resolutions are written "1 Acumen reward. You finally know." A rule
     * that takes any leading sentence called that beat "1 Acumen reward", which
     * is how it read on the tracker. */
    const beat = splitBeat("1 Acumen reward. You finally know who you are.");
    assert.equal(beat.title, "");
    assert.equal(beat.reward, "1 Acumen reward");
    assert.equal(beat.description, "You finally know who you are.");
  });

  test("no leading sentence means no title, and nothing is invented", () => {
    const beat = splitBeat("You look into your own family background and find nothing");
    assert.equal(beat.title, "");
    assert.equal(beat.description, "You look into your own family background and find nothing");
  });

  test("a long opening sentence is prose, not a name", () => {
    /* Sixty characters is the ceiling: past that it is a sentence that happens
     * to end early, and taking it as a title would put a paragraph in a
     * heading. */
    const long = "You look into your own family background at some considerable length. Then more.";
    assert.equal(splitBeat(long).title, "");
    assert.equal(splitBeat(long).description, long);
  });

  test("a decimal in the prose does not end the title", () => {
    const beat = splitBeat("Version 1.5 of the Plan. You revise it again.");
    assert.equal(beat.title, "", "1.5 has no space after the point, so the line has no title");
    assert.ok(beat.description.startsWith("Version 1.5"));
  });

  test("whitespace is normalised, since the text arrives line-wrapped", () => {
    const beat = splitBeat("  Research.\n  1 Acumen reward.\n  You look   into it.  ");
    assert.equal(beat.title, "Research");
    assert.equal(beat.description, "You look into it.");
  });

  test("nothing at all is not a crash", () => {
    for (const empty of [undefined, null, "", "   "]) {
      assert.deepEqual(splitBeat(empty), { title: "", description: "", reward: "" });
    }
  });
});
