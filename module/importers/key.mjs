/**
 * Invisible Sun — The Key: the goods lists, and where a character comes from.
 *
 * This reads the priced tables. The heart, soul and foundation write-ups in
 * the same book are read by creation.mjs, and the two are driven together from
 * readEntries at the foot of this file, because extracting the text of two
 * hundred pages is the expensive part of reading either.
 *
 * Everything imported so far has come off a card. These have not: the Money
 * and Goods chapter sets out what a vislae can buy — furniture, clothes,
 * weapons, poisons, passage on a skyship — as thirteen sections of priced
 * tables. The Objects of Power Deck carries fifty of the kindled items among
 * them, and The Way says so out loud ("the kindled items in the goods lists in
 * The Key are included in the deck as well"), but the several hundred entries
 * around those fifty exist nowhere else.
 *
 * ── Why the tables are read from their own headings ──
 * Every table on these pages prints a two-word header, "Item" and "Cost", and
 * that header is the only thing that says where its columns are. It has to be,
 * because they move: across the thirty tables in the chapter the Cost column
 * sits at x=247, 268, 283, 526, 544, 565, 573 and 580, and the Item column at
 * 76, 373 and 432. A reader that assumed a page was two even halves would put
 * the aethyric devices table — which starts at x=432 — in the wrong place, and
 * would cut through the cost column of half the rest.
 *
 * ── What separates a row from the line below it ──
 * A row is a name and a price, and either can wrap, so which lines belong
 * together is a question in its own right. It is answered by the price — see
 * splitRows, which is where that gets involved.
 *
 * ── And what stops a table ──
 * These pages carry sidebars and footnotes set in the same column as the table
 * above them, so "keep reading until the page ends" quietly appends them to
 * the last row. What actually ends a table is the text stepping out of its
 * columns: every line of a table body starts either at the Item column or at
 * the Cost column, to within a couple of points, and the prose does not.
 * On page 186 the note about telephones begins at x=369 against an Item column
 * at 373 — four points, but four points is the difference between a row and a
 * paragraph, and nothing in the book blurs it.
 */

import { LINE_TOLERANCE, joinWords, pageWords } from "./book-page.mjs";
import * as creation from "./creation.mjs";
import * as fortes from "./fortes.mjs";
import * as arcs from "./arcs.mjs";
import * as skills from "./skills.mjs";
import * as orders from "./orders.mjs";

/**
 * How far a line may sit from a column's anchor and still belong to it.
 *
 * Body text is set flush to the column, so this only has to absorb the
 * rounding in the text matrix — but it also has to stay under the four points
 * that separate a heading from its table (headings are outdented to x=72 and
 * x=369 against rows at 76 and 373). Three points does both.
 */
const COLUMN_SLACK = 3;

/** How far above its table a sub-heading may sit. The gap is one line — 13 to
 *  15 points across the chapter — and the next thing further up is a table. */
const SUBHEAD_GAP = 26;

/** A section heading is set larger than the body: 12 points against 10. */
const HEADING_HEIGHT = 11;

/**
 * How far under its table's own type a line may be set and still be a row.
 *
 * The notes under these tables are set smaller than the rows above them — 8
 * points against 10 for the sunships under the ticket prices, 9 for the one
 * about telephones — and they are set in the table's own column, four points
 * over. So position alone reads them as rows, and "Sunship ticket" acquires
 * "Sunships are massive, intelligent vehicle creatures that are also the most
 * common way to". The size is what the book uses to say they are not rows.
 */
const HEIGHT_SLACK = 0.5;

/**
 * How far a heading is outdented from the table it introduces.
 *
 * Four points, every time: sections and sub-headings are set at x=72 and
 * x=369, against Item columns at 76 and 373. It is what tells a heading from
 * a row, and — because the next column's heading is the first thing in it —
 * it is also where one column ends and the next begins. Dividing at the Item
 * column instead left those four points on the wrong side, and the right
 * column's heading was read as part of the left column's: JEWELRY and
 * TRAVELING EQUIPMENT came back as one section named after both.
 */
const HEADING_OUTDENT = 4;

/**
 * How many points of damage a weapon does, printed once over its table.
 *
 * Weapons are the one section whose entries do not carry their own statistic.
 * "Light (all inflict 2 points of damage)" heads a table of seven, and if that
 * heading is only kept as a label the damage is lost — it is stated nowhere
 * else in the book.
 */
const DAMAGE = /^(.*?)\s*\(all inflict (\d+) points? of damage\)\s*$/i;

/**
 * The Key's section headings, as the compendium files them.
 *
 * The headings are read off the page rather than assumed, so this only has to
 * turn what was read into a key. Anything it does not recognise still imports,
 * filed under "other" — a heading this list has not met is a reason to look at
 * a new printing, not a reason to drop a table of prices on the floor.
 */
const CATEGORIES = {
  "Home Furnishings and Needs": "furnishings",
  "Supplies and Tools": "supplies",
  "Clothing": "clothing",
  "Jewelry": "jewelry",
  "Magical Implements": "implements",
  "Traveling Equipment": "travel",
  "Traveling Expenses": "expenses",
  "Weapons": "weapons",
  "Poisons": "poisons",
  "Services": "services",
  "Building Rental and Real Estate": "property",
  "Crafting Materials": "materials",
  "Emotions and Concepts": "emotions"
};

/** Kindled items are marked with one asterisk in the lists, aethyric devices
 *  with two. The Key p183: "Goods marked with an asterisk (*) are referred to
 *  as 'kindled'"; p185 marks the aethyric ones "with two asterisks (**)". */
const MARKS = /^(\*{1,2})\s*/;

/** Gather words into lines by baseline, each line's words left to right. */
export function toLines(words) {
  const lines = [];
  for (const word of [...words].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const line = lines.find(l => Math.abs(l.y - word.y) < LINE_TOLERANCE);
    if (line) line.words.push(word);
    else lines.push({ y: word.y, words: [word] });
  }
  for (const line of lines) {
    line.words.sort((a, b) => a.x - b.x);
    line.x = line.words[0].x;
    line.h = Math.max(...line.words.map(w => w.h));
  }
  return lines.sort((a, b) => a.y - b.y);
}


/**
 * Every table on a page, located by its own header row.
 *
 * A header is the word "Item" with the word "Cost" to its right on the same
 * baseline. Where two tables share a baseline — which happens on most of these
 * pages, the left and right halves being set to the same grid — the nearest
 * Cost is the one that belongs to this Item. Taking the first in document
 * order instead paired the left table's Item with the right table's Cost, and
 * put a page and a half of clothing prices into a column that was not there.
 */
export function findTables(lines) {
  const tables = [];
  for (const line of lines) {
    const items = line.words.filter(w => w.text === "Item");
    const costs = line.words.filter(w => w.text === "Cost");
    for (const item of items) {
      const cost = costs.filter(c => c.x > item.x).sort((a, b) => a.x - b.x)[0];
      if (cost) tables.push({ y: line.y, itemX: item.x, costX: cost.x, h: item.h });
    }
  }
  // A table reaches as far right as the next column's heading, which sits a
  // measured four points ahead of that column's own Item.
  for (const table of tables) {
    const next = tables
      .map(t => t.itemX)
      .filter(x => x > table.costX)
      .sort((a, b) => a - b)[0];
    table.right = next === undefined ? Infinity : next - HEADING_OUTDENT;
  }
  return tables;
}

/**
 * Where a price begins, and where one carries on.
 *
 * Every price in the chapter opens with a figure — "5 crystal orbs", "60–120
 * orbs" — bar four that open with a word, and those four are capitalised:
 * "Varies", "No cost", "Match price to other power source of the same level".
 * The lines that continue a price never are. They are the tail of a phrase and
 * are set as one: "and 25", "bloodsilver", "orbs", "source of the same level".
 */
const PRICE_START = /^[0-9A-Z]/;

/**
 * A price that cannot have finished.
 *
 * The one thing the shape of a price cannot catch is a second line that opens
 * with a figure of its own — "1 gem orb and" / "10 bloodsilver" is one price
 * for one pair of boots, and read as two it becomes two pairs. What says so is
 * the line above: it ends on a conjunction, and nothing that ends on "and" is
 * a finished price.
 */
const PRICE_OPEN = /(\band|\bplus|\bor|\+|,)$/;

/**
 * Split a table's body lines into rows.
 *
 * A row is a name and a price, and either can wrap — often both at once, which
 * is what makes this worth spelling out. Read a line at a time, a single pair
 * of boots becomes three entries, two of them priced "and 25" and
 * "bloodsilver":
 *
 *     *Blood boots: 3 bene Accuracy, 1 vex           3 gem orbs
 *     Interaction. Dark red boots with an aura of    and 25
 *     murder                                         bloodsilver
 *
 * So the price is what divides them: a line that starts one begins a new
 * entry, and every line after it belongs to that entry until the next price
 * starts.
 *
 * ── Why not the leading ──
 * The tables that wrap their prices are also set with a step in the leading —
 * 13.0 points between the lines of a row against 15.3 between one row and the
 * next — and that step reads them correctly. It is not used, because it is not
 * in every table: the weapons and poisons are set at 13.0 throughout, and the
 * last table in the chapter runs the other way, 13.0 within a row and 12.4
 * between. Three settings in one chapter is not a rule, and a rule that has to
 * ask the table which of three it is fails on the fourth.
 */
export function splitRows(lines, table) {
  const rows = [];
  for (const line of lines) {
    const cost = line.words.filter(w => w.x >= table.costX - COLUMN_SLACK);
    const name = line.words.filter(w => w.x < table.costX - COLUMN_SLACK);
    const previous = rows[rows.length - 1];
    const starts = cost.length && name.length
      && PRICE_START.test(joinWords(cost))
      && !(previous && PRICE_OPEN.test(joinLines(previous.cost)));

    if (starts || !previous) {
      if (name.length) rows.push({ name: [...name], cost: [...cost] });
    } else {
      previous.name.push(...name);
      previous.cost.push(...cost);
    }
  }
  return rows.map(r => ({ name: joinLines(r.name), cost: joinLines(r.cost) }));
}

/** Words gathered from several lines, joined line by line. */
function joinLines(words) {
  const lines = [];
  for (const word of words) {
    const line = lines.find(l => Math.abs(l.y - word.y) < LINE_TOLERANCE);
    if (line) line.words.push(word); else lines.push({ y: word.y, words: [word] });
  }
  return lines.sort((a, b) => a.y - b.y)
    .map(l => joinWords(l.words.sort((a, b) => a.x - b.x)))
    .join(" ");
}

/**
 * Read one page's tables.
 *
 * Columns are walked one at a time, top to bottom, because that is the order
 * the headings apply in: a section heading names every table below it in its
 * column and then carries on over the page — CLOTHING is printed once, at the
 * top of a left column, and governs three pages of tables after it.
 */
export function readPage(words, tables, state) {
  const rows = [];
  const columns = [...new Set(tables.map(t => Math.round(t.itemX)))].sort((a, b) => a - b);

  for (const columnX of columns) {
    const mine = tables.filter(t => Math.round(t.itemX) === columnX).sort((a, b) => a.y - b.y);
    const right = Math.min(...mine.map(t => t.right));
    const left = columnX - HEADING_OUTDENT;

    /* Lines are gathered from this column's words alone, never from the page.
     * The two halves of a spread are set to baselines a third of a point
     * apart — the left table's row at y=152.0 against the right table's at
     * 151.7 — so a page-wide pass merges them into one line and every gap in
     * the table inherits that third of a point. It is a small error and it
     * lands on a threshold: the leading step this reads rows by is 2.3 points,
     * and jitter either way was enough to cut nine rows on page 186 alone in
     * half, stranding "day is spent researching" as an entry of its own. */
    const inColumn = toLines(words.filter(w => w.x >= left && w.x < right));

    let table = null;
    let body = [];
    let pending = null;   // the last line that was neither row nor heading

    /* A table is only read once its last line is known, because how its rows
     * divide is a property of the whole table rather than of any one line. */
    const flush = () => {
      if (table && body.length) {
        for (const row of splitRows(body, table)) {
          rows.push({ ...row, section: table.section, subsection: table.subsection,
                      page: state.page });
        }
      }
      table = null;
      body = [];
    };

    for (const line of inColumn) {
      const here = line;

      const header = mine.find(t => Math.abs(t.y - line.y) < LINE_TOLERANCE);
      if (header) {
        flush();
        /* The line just above a header names the table — "Footgear",
         * "Light (all inflict 2 points of damage)". Anything further up is the
         * previous table, so the gap is what qualifies it. */
        state.subsection = pending && line.y - pending.y < SUBHEAD_GAP
          ? joinWords(pending.words) : "";
        table = { ...header, section: state.section, subsection: state.subsection };
        pending = null;
        continue;
      }

      const text = joinWords(line.words);
      if (line.h >= HEADING_HEIGHT && text === text.toUpperCase() && /[A-Z]/.test(text)) {
        flush();
        state.section = title(text);
        state.subsection = "";
        pending = null;
        continue;
      }

      if (!table) { pending = here; continue; }

      const startsAtName = Math.abs(here.x - table.itemX) <= COLUMN_SLACK;
      const startsAtCost = Math.abs(here.x - table.costX) <= COLUMN_SLACK;
      if ((!startsAtName && !startsAtCost) || line.h < table.h - HEIGHT_SLACK) {
        /* Out of the table's columns, or under its type: a sidebar, a
         * footnote, the watermark. */
        flush();
        pending = here;
        continue;
      }
      body.push(here);
    }
    flush();
  }
  return rows;
}

/** THE KEY → The Key; HOME FURNISHINGS AND NEEDS → Home Furnishings and Needs. */
function title(text) {
  const small = new Set(["and", "or", "of", "the", "a", "an", "in", "to"]);
  return text.toLowerCase().split(/\s+/)
    .map((word, i) => (i > 0 && small.has(word))
      ? word : word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Split a row into the thing and what the book says about it.
 *
 * Most entries are a bare name. The ones that are not put the explanation
 * after a colon — "Watcher painting: always stares at you" — and a few put a
 * level there too, which is how weapons and poisons carry their statistics.
 */
export function parseRow(row) {
  let name = row.name.replace(/\s+/g, " ").trim();
  const marks = MARKS.exec(name);
  const kindled = marks?.[1] === "*";
  const aethyric = marks?.[1] === "**";
  if (marks) name = name.slice(marks[0].length);

  let description = "";
  const colon = name.indexOf(": ");
  if (colon > 0) {
    description = name.slice(colon + 2).trim();
    name = name.slice(0, colon).trim();
  }

  const level = /\blevel (\d+)/i.exec(description)?.[1];
  const damage = DAMAGE.exec(row.subsection);

  return {
    name,
    description,
    kindled,
    aethyric,
    level: level ? Number(level) : 0,
    damage: damage ? Number(damage[2]) : 0,
    kind: kindled ? "kindled" : "goods",
    cost: row.cost.replace(/\s+/g, " ").trim(),
    section: row.section,
    category: CATEGORIES[row.section] ?? "other",
    subsection: damage ? damage[1] : row.subsection,
    page: row.page
  };
}

/** One entry of the goods lists, as an item. */
export function toItem(entry) {
  return {
    name: entry.name,
    type: "Gear",
    img: "icons/containers/chest/chest-worn-oak-tan.webp",
    system: {
      category: entry.category,
      subcategory: entry.subsection,
      cost: entry.cost,
      description: entry.description ? `<p>${entry.description}</p>` : "",
      level: entry.level,
      damage: entry.damage,
      kindled: entry.kindled,
      aethyric: entry.aethyric
      /* quantity is the player's, not the book's, and every import would reset
       * it to one. Left out for the same reason the incantation categories
       * are: a field written back to its default is a field overwritten. */
    }
  };
}

/**
 * Everything this can read out of The Key, in the order it is printed.
 *
 * One walk of the book rather than one per chapter. The goods lists, the
 * character-creation entries, the fortes, the character arcs and the skill
 * list are nothing like each other — priced tables, labelled write-ups, a
 * chapter of trees, a run of beats, three bulleted lists — but they are in the
 * same PDF, and extracting the text of two hundred pages is the expensive part
 * of reading any of them.
 */
export async function readEntries(doc, { onProgress } = {}) {
  const state = { section: "", subsection: "", page: 0 };
  const characters = creation.reader();
  const forteReader = fortes.reader();
  const arcReader = arcs.reader();
  const skillReader = skills.reader();
  const orderReader = orders.reader();
  const goods = [];

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const { height } = page.getViewport({ scale: 1 });
    const words = pageWords((await page.getTextContent()).items, height);

    const tables = findTables(toLines(words));
    if (tables.length) {
      state.page = n;
      for (const row of readPage(words, tables, state)) goods.push(parseRow(row));
    }
    characters.page(words, n);
    forteReader.page(words, n);
    arcReader.page(words, n);
    skillReader.page(words, n);
    orderReader.page(words, n);

    onProgress?.({ done: n, total: doc.numPages, found: goods.length });
  }
  return [...goods, ...characters.done(),
          ...forteReader.done().flatMap(forte => fortes.entries(forte, "The Key")),
          ...arcReader.done(), ...skillReader.done(), ...orderReader.done()];
}

/**
 * Which pack an entry belongs in.
 *
 * The fifty kindled items in the goods lists are already in the game: they are
 * printed on cards in the Objects of Power Deck, and the deck importer has
 * brought them in with their level, form and effect. All the goods lists add
 * is what they sell for, which no card states. So they are not imported again
 * as goods — they are looked up by name in the pack they are already in, and
 * given their price.
 *
 * The match is exact and it has been checked: all fifty names in the lists
 * appear among the fifty cards the deck marks kindled, and nothing else in the
 * chapter shares a name with any object or ephemera card.
 */
export const sort = (entry) => entry.kind;

/**
 * A price, and nothing else.
 *
 * Deliberately not a whole item. This is written over a card that has already
 * been imported, and a payload carrying a level, a form or a description would
 * write those too — as blanks, because the goods lists do not state them.
 * Fields set empty are not fields left alone; the Sooth deck erased sixty
 * write-ups learning that.
 */
export function toPrice(entry) {
  return { system: { cost: entry.cost } };
}
