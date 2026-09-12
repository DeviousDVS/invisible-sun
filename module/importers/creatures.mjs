/**
 * Invisible Sun — reading creatures and NPCs out of the books
 *
 * Three books print stat blocks and no others do: Teratology, which is the
 * bestiary; The Path, which adds the creatures of the suns and a handful of
 * generic templates; and The Nightside, whose sixteen are named characters
 * rather than beasts. 310 entries between them, and nothing else in any book
 * carries the shape — `Level:` appears four hundred times in the Van Hauten
 * compilation alone, on spells and secrets.
 *
 * ── What makes an entry an entry ──
 * The health boxes. A stat block is the only thing in these books that prints
 * `Injuries:` / `Wounds:` / `Anguish:`, and it prints all three, in that order,
 * directly under the level. That triple is the signature this reads for, and it
 * is why a spell's `Level: 4` is never mistaken for a creature's.
 *
 * ── The boxes are drawn, not typed ──
 * All 310 print the three labels with nothing after them in the text layer, and
 * that used to be read as "these are blank tick boxes, so there is nothing to
 * import". It is the opposite: how many boxes there are is the number, and the
 * boxes are rectangles the page draws rather than characters it sets, so
 * nothing but the operator list can see them. The Abdominous prints twelve
 * Injuries, ten Wounds and eight Anguish, and got the model's own defaults —
 * a threshold worked out from its level, and a track two long.
 *
 * What they mean is Teratology's own sentence, p11: "Just like with a PC, boxes
 * represent damage sustained as Injuries, and when Injuries are all checked,
 * they become a Wound or Anguish, as appropriate (and then reset)." So the
 * Injuries row is the threshold a set converts at — which is exactly what
 * `health.injuryThreshold` holds — and the other two are the capacity of their
 * tracks.
 *
 * ── The entry with no name ──
 * Teratology p.59 is a shapeshifter whose description opens "No one knows your
 * real name. Or your real shape." The book takes it literally: where every
 * other entry prints a name in capitals, this one prints a single glyph, which
 * comes off the page as "(". There is nothing there to read, so the entry is
 * dropped rather than named after the section heading above it — which is what
 * it used to be, and it reached the compendium as "And Entities". It is one of
 * the two Teratology is short of its 246.
 *
 * ── What the layout does to a description ──
 * A description usually sits between the name and the level as ordinary body
 * text. Sometimes it does not: a few entries are set in a narrow margin column
 * where every line is three or four words wide, and one is separated from its
 * block by cross-references set between them. So the description is taken as
 * whatever body text precedes the level within the entry, with page furniture
 * dropped, rather than by measuring how long the lines are.
 */
import { columnAnchors, columnLines } from "./book-page.mjs";
import { titleCase, reader as forteReader, entries as forteEntries } from "./fortes.mjs";

/**
 * Type sizes these books set a name and a section heading at.
 *
 * A name is two points above the body — 12 against 10 — and a section heading
 * three above that. Names are not identified by height, because The Path sets
 * some of them at body size, but a candidate this large is a section heading
 * and never a name.
 */
const SECTION_HEIGHT = 14;

/**
 * How far apart two lines of one wrapped name sit, as a multiple of their size.
 *
 * Measured rather than chosen. Across all three books there are 22 places where
 * the line directly above a name is itself name-shaped, and they fall into two
 * groups with nothing between them: ten are a name that wrapped, set at the same
 * size as the line below with a ratio of 1.08 in Teratology and The Path and
 * 1.25 in The Nightside; the other twelve are a section heading, set three
 * points larger at a ratio of 2.17. Anything at 1.5 or under is a wrap.
 */
const NAME_LEADING = 1.5;

/**
 * How far a tick box may sit from the label that owns it.
 *
 * Down the page: half a line, because the boxes sit on their label's own
 * baseline and nothing else is within six points of it.
 *
 * Across: a box is to the right of its label and inside the same column. The
 * books set two columns 356 points apart and the longest row of boxes measured
 * — the Abdominous's twelve Injuries — runs 137, so 300 is clear of the next
 * column by a margin and clear of the longest row by one too.
 */
const BOX_BASELINE = 6;
const BOX_REACH = 300;

/** The level line that opens a stat block. Its value is always on the line. */
const LEVEL_RE = /^Level:\s*(\d+)/;

/** The three tick-box lines, which is what tells a stat block from a spell. */
const BOXES = ["Injuries:", "Wounds:", "Anguish:"];

/* Which field each of them fills, derived from the labels rather than written
 * out again: the same three words in two lists is two lists to keep in step. */
const TRACK = Object.fromEntries(BOXES.map(box => [box, box.slice(0, -1).toLowerCase()]));

/**
 * How many tick boxes belong to one label's line.
 *
 * Pure, and the half of this worth testing: the rectangles themselves come off
 * the operator list mechanically, but which of them belongs to "Wounds:" rather
 * than to "Injuries:" one line above is a judgement about two tolerances.
 */
export function countBoxes(boxes, line) {
  if (!boxes?.length || !line) return 0;
  return boxes.filter(box =>
    Math.abs(box.y - line.y) <= BOX_BASELINE
    && box.x > line.x
    && box.x < line.x + BOX_REACH).length;
}

/** A labelled field inside the block: "Defenses (Physical): …", "Bite: …". */
const LABEL_RE = /^([A-Z][A-Za-z][A-Za-z ()/'’-]{0,38}):\s*(.*)$/;

/** Armor is a number, sometimes with the circumstance it applies in. */
const ARMOR_RE = /^\+?(\d+)\s*(?:\((.*)\))?/;

/** Fields that are themselves, rather than a named power. */
const KNOWN = new Set(["Armor", "Modifications", "Traits", "Level", ...BOXES.map(b => b.slice(0, -1))]);

/** Page furniture that is not part of anybody's description. */
const FURNITURE = /^(\d{1,3}|[A-Z][a-z]+.{0,40},\s*page \d+|page \d+|.{0,40},\s*$)$/i;


/**
 * Is this line the start of a stat block?
 *
 * The level, with the three boxes under it. Checked as a group because the
 * level alone is the commonest line in these books and means nothing on its own.
 */
export function startsBlock(lines, i) {
  const level = LEVEL_RE.exec(lines[i]?.text ?? "");
  if (!level) return null;
  const following = lines.slice(i + 1, i + 4).map(l => l?.text?.trim() ?? "");
  if (!BOXES.every((box, k) => following[k]?.startsWith(box))) return null;
  return { level: Number(level[1]) };
}

/**
 * Turn the lines of one stat block into its fields.
 *
 * Pure, so it can be tested without a PDF: the fixtures in
 * scripts/test/creatures.test.mjs are the shapes the page actually produces.
 *
 * A label continues until the next label, because every one of these can run to
 * more than a line and the books wrap them without indenting. Anything with no
 * label of its own belongs to whatever was last opened.
 */
export function parseBlock(lines) {
  const out = { armor: 0, armorNote: "", defenses: [], modifications: "",
                traits: "", abilities: [],
                /* Null rather than zero where a row was not read at all, so
                 * "this book prints no boxes here" stays distinguishable from
                 * "it prints none", and toItem can leave the model's own
                 * default in place rather than writing a track of length nil. */
                injuries: null, wounds: null, anguish: null };
  let open = null;

  const put = (label, text) => {
    const value = text.trim();
    if (label === "Armor") {
      const m = ARMOR_RE.exec(value);
      if (m) { out.armor = Number(m[1]); out.armorNote = m[2] ?? ""; }
      return;
    }
    if (label === "Modifications") { out.modifications = value; return; }
    if (label === "Traits") { out.traits = value; return; }
    if (label.startsWith("Defenses")) {
      const kind = /\((.*)\)/.exec(label)?.[1] ?? "";
      out.defenses.push({ kind, text: value });
      return;
    }
    out.abilities.push({ name: label, description: value });
  };

  for (const line of lines) {
    const text = line.text.trim();
    if (!text || LEVEL_RE.test(text)) continue;

    /* The three rows carry their number as boxes rather than as text, counted
     * when the page was read. They are still skipped as labels — there is
     * never anything after the colon to parse. */
    const track = Object.entries(TRACK).find(([label]) => text.startsWith(label));
    if (track) {
      if (line.boxes) out[track[1]] = line.boxes;
      continue;
    }

    const m = LABEL_RE.exec(text);
    /* A label, unless it is a sentence that happens to contain a colon. The
     * books set these labels in bold at the head of their line, and every one
     * of them is either a field this knows or a named power in title case. */
    if (m && (KNOWN.has(m[1]) || m[1].startsWith("Defenses") || isPowerName(m[1]))) {
      open = { label: m[1], text: m[2] };
      put(open.label, open.text);
      continue;
    }
    if (!open) continue;

    // A continuation: append to whatever is open and rewrite it.
    open.text = `${open.text} ${text}`.trim();
    if (open.label === "Armor") continue;          // armor never wraps usefully
    if (open.label === "Modifications") out.modifications = open.text;
    else if (open.label === "Traits") out.traits = open.text;
    else if (open.label.startsWith("Defenses")) out.defenses.at(-1).text = open.text;
    else out.abilities.at(-1).description = open.text;
  }
  return out;
}

/**
 * A named power, as opposed to a sentence that happens to contain a colon.
 *
 * Title case was tried as the test and rejected 44 of the 735 labels these
 * blocks carry — every one of them a real ability. The books do not name powers
 * in title case: "Claws or bite", "Immunity to Magic", "Sup on Past Wrongs",
 * "Mountain Smash (when vast)". Requiring a capital on every word threw all of
 * those away and kept nothing, because inside a stat block there is nothing to
 * keep out: all 735 labels surveyed are fields or powers, and not one is a
 * sentence.
 *
 * What is left is a guard against a runaway line rather than a classifier. A
 * label is short and is not a sentence, which is to say it has no full stop.
 */
function isPowerName(label) {
  if (/\./.test(label)) return false;
  return label.split(/\s+/).length <= 6;
}

/** Everything before the level that is not page furniture. */
export function describe(lines) {
  return lines
    .map(l => l.text.trim())
    .filter(t => t && !FURNITURE.test(t))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Is `above` the first line of the name whose second line is `line`?
 *
 * Exported for the tests: the whole of this is a judgement about two numbers,
 * and a fixture is the only way to pin down which two.
 */
export function continuesName(above, line) {
  if (!above || !line) return false;
  // A wrap stays in its column. Across a column or page break the two y values
  // are measured from different tops and their difference means nothing.
  if (above.page !== line.page || above.col !== line.col) return false;

  const h = line.h ?? 0;
  if (!h || Math.abs((above.h ?? 0) - h) > 0.5) return false;

  const gap = line.y - above.y;
  if (!(gap > 0 && gap <= h * NAME_LEADING)) return false;

  return isName(above.text.trim());
}

/**
 * Find every stat block in a book's lines, in reading order.
 *
 * Anchored on the block, not on the name. Names were tried first and are not
 * dependable: these books set sidebar headings in capitals at body size too, so
 * "PROVENANCE. PURCHASE AT YOUR OWN RISK." reads as a name, and an entry whose
 * name sits in the previous column has none within reach at all. The health
 * boxes are the one thing only a stat block has, so they are what this looks
 * for; the name is then the nearest capitals line above it, and the description
 * is whatever lies between the two.
 *
 * Pure, and takes the book's lines in order, so it can be tested against a
 * page's worth of fixture without a PDF.
 */
export function collect(all) {
  const found = [];
  const starts = [];
  for (let i = 0; i < all.length; i++) if (startsBlock(all, i)) starts.push(i);

  for (const [k, i] of starts.entries()) {
    const { level } = startsBlock(all, i);
    const previous = k ? starts[k - 1] : -1;

    /* The block runs to its Traits line, which is what the books close on, or
     * to the next block where an entry prints none. */
    let end = starts[k + 1] ?? all.length;
    for (let j = i; j < end; j++) {
      if (/^Traits:/.test(all[j].text.trim())) { end = j + 1; break; }
    }

    /* The name is the nearest capitals line above, and is not looked for past
     * the previous entry's block, so an entry whose name the layout put out of
     * reach borrows nothing from its neighbour. */
    let name = null, nameEnd = i;
    for (let j = i - 1; j > previous; j--) {
      /* Section headings are set larger than names — 15 against 12 — and wrap
       * across two lines, so the second half of "MAJOR CREATURES / AND
       * ENTITIES" is capitals, short, and directly above an entry whose own
       * name is out of reach. One creature was called "And Entities" because
       * of it, which is worse than having no name at all: a missing entry
       * shows up against the expected count, and a plausible wrong one does
       * not. */
      if ((all[j].h ?? 0) >= SECTION_HEIGHT) continue;
      if (isName(all[j].text.trim())) { name = all[j].text.trim(); nameEnd = j; break; }
    }
    if (!name) continue;

    /* A name that did not fit on one line. Ten of the 307 are set across two —
     * "GATIVA VAIL, SECRAMAL DANCER / OF THE THIRD CRIME", "DARK-EYED MANFRED /
     * THE APOSTATE" — and the walk above stops at the lower half, which is the
     * half nearest the block. Four of the ten read perfectly well on their own
     * ("The Plighted Troth", "Bittersweet Mallow"), so they were in the
     * compendium under a wrong name that nothing would ever have flagged.
     *
     * Taken while the line above is the same name still going: same column,
     * same size, and one line's leading above. That last is what tells it from
     * a section heading, which is the other thing set in capitals directly
     * above a name — see NAME_LEADING for the measurement.
     *
     * Where the name reaches back to is tracked apart from where it ends,
     * because the description begins under the *last* line of the name. Sharing
     * one index would have fed the second half of every wrapped name back in as
     * the opening words of its own description. */
    let nameStart = nameEnd;
    while (nameStart - 1 > previous && continuesName(all[nameStart - 1], all[nameStart])) {
      nameStart -= 1;
      name = `${all[nameStart].text.trim()} ${name}`;
    }

    found.push({
      name: titleCase(name.replace(/\s+/g, " ").trim()),
      description: describe(all.slice(nameEnd + 1, i)),
      ...parseBlock(all.slice(i, end)),
      level,
      page: all[i].page ?? null
    });
  }
  return found;
}

/**
 * Walk a book, gathering its lines, and read them all at the end.
 *
 * Gathered rather than parsed page by page because an entry straddles columns
 * and pages: a name at the foot of one column with its level at the head of the
 * next is ordinary, and a reader that has forgotten the previous column cannot
 * find that name at all.
 */
export function reader({ book = "", npc = false } = {}) {
  const all = [];

  return {
    page(words, n, boxes = []) {
      const columns = columnAnchors(words);
      if (!columns) return;
      for (let column = 0; column < columns.length; column++) {
        for (const line of columnLines(words, columns, column)) {
          /* Headings are kept, because a creature's name is one. The books set
           * a name two points above the body — 12 against 10 — and a section
           * heading three above that, so isHeading is true of both. Dropping
           * them, which is what a reader of prose wants, took every name with
           * it and left 304 of the 310 entries nameless. */
          /* Counted here rather than in `collect`, so that everything below
           * works on lines alone and can still be tested with a fixture. Only
           * the three labels can own boxes, and nothing else on these pages
           * draws a small square, but asking for every line would be a count
           * on nine hundred lines a page to find three. */
          const owns = BOXES.some(box => line.text.startsWith(box));
          all.push({ ...line, page: n, col: column,
                     boxes: owns ? countBoxes(boxes, line) : 0 });
        }
      }
    },
    done() {
      return collect(all).map(entry => ({
        kind: npc ? "npc" : "creature", ...entry, source: book
      }));
    }
  };
}

/**
 * A name is set in capitals, is short, and is not a sentence.
 *
 * Height was tried as the test and is wrong. Most names are set two points
 * above the body, but not all: The Path sets "TYPICAL MEDIUM ANIMAL" and its
 * fellows at body size, and so does Teratology for the second half of a split
 * entry like "VIDDISHIN (ADULT-SIZED)". Requiring a heading lost ten entries
 * between them.
 *
 * What separates a name from the capitalised sentences these books set in their
 * sidebars is the full stop. "PROVENANCE. PURCHASE AT YOUR OWN RISK." has two;
 * no name has any. A colon is allowed, because several names carry one —
 * "CYST SPAWN: SHIVERBLOAT" names a kind and then the particular thing.
 */
export function isName(text) {
  if (!/^[A-Z][A-Z0-9 ,:.'’“”\-()/&]*$/.test(text)) return false;
  if (!/[A-Z]{2}/.test(text)) return false;
  /* A full stop is allowed only as an initial — a single letter and a point,
   * as in "J.C. NEDRICK, ESQUIRE". That keeps the sidebar sentences out, which
   * is what the rule is for: "PROVENANCE. PURCHASE AT YOUR OWN RISK." stops a
   * whole word, not a letter. */
  for (const m of text.matchAll(/\./g)) {
    const before = text.slice(0, m.index);
    if (!/(^|[^A-Z])[A-Z]$/.test(before)) return false;
  }
  return text.split(/\s+/).length <= 6 && text.length <= 48;
}

/** Read a whole book. */
export async function readEntries(doc, { book = "", npc = false, onProgress } = {}) {
  const { pageWords } = await import("./book-page.mjs");
  const read = reader({ book, npc });
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const { height } = page.getViewport({ scale: 1 });
    const words = pageWords((await page.getTextContent()).items, height);
    read.page(words, n, await boxesIfAny(page, words));
    onProgress?.({ done: n, total: doc.numPages });
  }
  return read.done();
}

/**
 * The page's tick boxes, but only where there are any to want.
 *
 * Building an operator list is far dearer than reading the text layer, and
 * fewer than half the pages of any of these books carry a stat block. The text
 * is already in hand by the time this is asked, so the cheap question — does
 * this page say "Injuries:" anywhere — is asked first.
 */
async function boxesIfAny(page, words) {
  if (!words.some(word => word.text.startsWith(BOXES[0]))) return [];
  const { pageBoxes } = await import("./pdf-deck.mjs");
  return pageBoxes(page);
}

/** Which pack an entry belongs in. */
export const sort = (entry) => entry.kind;

const ICONS = {
  creature: "icons/creatures/abilities/mouth-teeth-long-red.webp",
  npc: "icons/svg/mystery-man.svg"
};

/** One creature or NPC, as an Actor. */
export function toItem(entry) {
  /* Only what the page actually printed. A row whose boxes were not read leaves
   * the model's own default alone rather than writing a zero, which would be a
   * creature that cannot be hurt and cannot be killed. */
  const health = {};
  if (entry.injuries) health.injuryThreshold = entry.injuries;
  if (entry.wounds) health.wounds = { max: entry.wounds };
  if (entry.anguish) health.anguish = { max: entry.anguish };

  return {
    name: entry.name,
    type: entry.kind === "npc" ? "NPC" : "Creature",
    img: ICONS[entry.kind] ?? ICONS.creature,
    system: {
      level: entry.level,
      armor: entry.armor ?? 0,
      armorNote: entry.armorNote ?? "",
      health,
      defenses: entry.defenses ?? [],
      modifications: entry.modifications ?? "",
      traits: entry.traits ?? "",
      abilities: entry.abilities ?? [],
      description: entry.description ? `<p>${entry.description}</p>` : "",
      source: entry.source ?? "",
      page: entry.page ?? null
    }
  };
}

/**
 * The Nightside, whose named characters sit among its fortes.
 *
 * One walk of the PDF serves both, which is the arrangement threshold.mjs
 * already uses for the forte it carries beside its objects: two readers fed the
 * same pages, their results concatenated. Cheaper than reading a 194-page book
 * twice, and it keeps the two from disagreeing about which page they are on.
 */
export async function readWithFortes(doc, { book = "", npc = false, onProgress } = {}) {
  const { pageWords } = await import("./book-page.mjs");
  const mine = reader({ book, npc });
  const theirs = forteReader();
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const { height } = page.getViewport({ scale: 1 });
    const words = pageWords((await page.getTextContent()).items, height);
    mine.page(words, n, await boxesIfAny(page, words));
    theirs.page(words, n);
    onProgress?.({ done: n, total: doc.numPages });
  }
  return [...mine.done(), ...theirs.done().flatMap(forte => forteEntries(forte, book))];
}
