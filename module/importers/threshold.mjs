import {
  PARAGRAPH_SLACK, columnLines, isHeading, pageWords, title
} from "./book-page.mjs";
import * as fortes from "./fortes.mjs";

/**
 * Invisible Sun — the objects written up in The Threshold's appendix.
 *
 * The Threshold closes with "Magic Elements", a few pages that set out the new
 * praxis the book introduced: secrets, a forte, an incantation or two, and
 * eight objects. The objects are the reason this exists. Every other object of
 * power and ephemera in the game is printed on a card and imported from a
 * deck; these eight are printed only here, and the deck importers will never
 * find them.
 *
 * Each entry is a heading naming the thing and, in brackets, what it is —
 * SAFE STEP BOOTS (OBJECT OF POWER), NESTARI ROD (RELIC), INDIGO SPHERE
 * (ARTIFACT) — followed by the same labelled fields the cards carry: Level,
 * Form, Depletion, Color. That bracket is what makes this readable at all,
 * and it is why the pages are found by looking for it rather than by page
 * number: a reprint that shifts the appendix by a page still reads.
 *
 * ── The asides ──
 * These pages are set in two columns with cross-references and asides down the
 * middle. Read by position alone the asides land inside sentences — "reach out
 * to strike The Potation of Never is not" — because an aside and a line of
 * body text share a baseline. What separates them is that the body is set
 * flush: every line of it starts at its column, or one indent in, and an aside
 * starts wherever the shape of it puts it, 240 points along.
 */

/**
 * Where a book's columns begin, book by book.
 *
 * Measured off the pages. The Threshold's appendix runs two even columns — 25
 * lines start at 443, 16 at 428, and none at all between 92 and 310. Secrets
 * of Silent Streets writes its one object into a box in the outer column, at
 * 442, against body text at 72.
 */
export const COLUMNS = {
  threshold: [72, 428],
  "silent-streets": [72, 442]
};

/** The labelled fields these entries carry, exactly as the cards do. */
const LABELS = ["Level", "Form", "Depletion", "Color"];

/**
 * What the bracket after a name can say, and what it means here.
 *
 * The appendix also describes secrets, a forte, a forte ability, an
 * incantation, a cantrip and a rules clarification. Those are left alone —
 * they are other kinds of thing, with their own compendia and their own
 * importers still to write — and listing only what is wanted is what keeps
 * them out without having to recognise them.
 */
export const TYPES = {
  "OBJECT OF POWER": "object",
  "RELIC": "relic",
  "ARTIFACT": "artifact",
  "EPHEMERA OBJECT": "ephemera"
};




/** A heading is set large and in capitals. */
/**
 * Split a heading into the thing's name and what the book calls it.
 *
 * A heading runs to one line or two, and the break can fall anywhere — "NESTARI
 * ROD (RELIC)" on one, "SAFE STEP BOOTS" and "(OBJECT OF POWER)" on two, "THE
 * PAST PREYS UPON THE" and "PRESENT (INCANTATION)" straight through the middle
 * of both. Joining the lines first and reading the bracket afterwards is the
 * only order that handles all three.
 */
export function parseHeading(text) {
  const match = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(text);
  if (!match) return { name: title(text.trim()), type: "" };
  return { name: title(match[1].trim()), type: match[2].trim().toUpperCase() };
}


/**
 * Read one entry's body: its labelled fields, and the prose between them.
 *
 * The prose is not one block. Nestari Rod says what the rod does, and then in
 * a second paragraph where the rods come from, and the two are separated the
 * way this book separates every paragraph — the first line flush to the
 * column, the rest indented. Losing that runs the description together into
 * one long paragraph, which is legible but is not what the page says.
 */
export function parseBody(lines, column) {
  const entry = { description: [] };
  let field = null;

  for (const line of lines) {
    const label = LABELS.find(l => line.text.startsWith(`${l}: `));
    if (label) {
      field = label.toLowerCase();
      entry[field] = line.text.slice(label.length + 2).trim();
      continue;
    }

    const flush = Math.abs(line.x - column) <= PARAGRAPH_SLACK;
    if (field && !flush) {
      // A labelled field that ran on to a second line.
      entry[field] += ` ${line.text}`;
      continue;
    }

    field = null;
    if (flush || !entry.description.length) entry.description.push(line.text);
    else entry.description[entry.description.length - 1] += ` ${line.text}`;
  }
  return entry;
}

/**
 * Every object written up in the book, in the order it is printed.
 *
 * Pages are read whole and entries picked out of them by their bracket, so
 * nothing here depends on where the appendix falls.
 *
 * ── Entries that run over the fold ──
 * Two of the eight break across a column: Vengeful Retribution ends "thrown
 * backward" at the foot of one page and picks up "at least 1 foot (30 cm) for
 * each level" at the head of the next, with its Color three lines further on.
 * Closing an entry at the end of its column loses that — the description stops
 * mid-sentence and the colour is dropped entirely — so an entry is left open
 * across the break and closed only by the next heading.
 *
 * Left open indefinitely it would instead swallow whatever follows the
 * appendix, so the break is checked before it is crossed: an entry carries on
 * only while it is unfinished, and what finishes one is its Color. Every entry
 * here ends on that line — it is the last of the four labels, in this book as
 * on the cards — so an entry that has reached it has nothing left to collect,
 * and one that has not is still mid-flight.
 *
 * Reading the break by indentation instead is the obvious thing and it is
 * wrong: Indigo Sphere breaks exactly at a paragraph, so its second half opens
 * flush at the column, looking for all the world like a fresh start.
 */
export async function readEntries(doc, { columns = COLUMNS.threshold, book, onProgress } = {}) {
  const found = [];
  /* The Threshold carries a forte as well as its objects, written up in the
   * idiom the other books use. One walk of the PDF serves both. */
  const forteReader = fortes.reader();
  let heading = [];
  let open = null;

  const close = () => {
    if (!open) return;
    const parsed = parseHeading(open.heading);
    const body = parseBody(open.lines, open.column);
    /* What makes an entry one of these is that it has a Form — the physical
     * thing the magic lives in. Every object and ephemera states one, and
     * nothing else in either book does: not the secrets, not the fortes, not
     * the incantations set on the same pages in the same shape. The bracket
     * after the name says which kind of object it is, where there is one.
     * Secrets of Silent Streets prints no bracket at all, and what it is
     * describing is still plainly an object of power. */
    const known = TYPES[parsed.type];
    if (body.form && (known || !parsed.type)) {
      found.push({ ...parsed, kind: known ?? "object", ...body, page: open.page });
    }
    open = null;
  };

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const { height } = page.getViewport({ scale: 1 });
    const words = pageWords((await page.getTextContent()).items, height);

    for (let column = 0; column < columns.length; column++) {
      const lines = columnLines(words, columns, column);
      if (!lines.length) continue;

      if (open && finished(open)) close();

      for (const line of lines) {
        if (isHeading(line)) {
          close();
          heading.push(line.text);
          continue;
        }
        if (heading.length) {
          open = { heading: heading.join(" "), lines: [], column: columns[column], page: n };
          heading = [];
        }
        if (open) open.lines.push({ ...line, x: line.x - columns[column] + open.column });
      }
    }
    forteReader.page(words, n);
    onProgress?.({ done: n, total: doc.numPages, found: found.length });
  }
  close();
  return [...found,
          ...forteReader.done().flatMap(forte => fortes.entries(forte, book))];
}

/** Which pack an entry belongs in. */
export const sort = (entry) => {
  if (entry.kind === "forte" || entry.kind === "forteAbility") return entry.kind;
  return entry.kind === "ephemera" ? "ephemera" : "objects";
};

/**
 * True once an entry has reached the last of its labelled fields.
 *
 * Color where a book prints one, Depletion where it does not — Secrets of
 * Silent Streets ends its object on the depletion and never states a colour.
 */
function finished(entry) {
  return entry.lines.some(line => /^(Color|Depletion): /.test(line.text));
}

/** "6 (+1 die)" → a level and the dice it grants. */
function splitLevel(text = "") {
  const match = /^(\d+)\s*(?:\(([^)]*)\))?/.exec(text.trim());
  return { level: match ? Number(match[1]) : 0, dice: match?.[2]?.trim() ?? "" };
}

const paragraphs = (lines = []) => lines.map(p => `<p>${p}</p>`).join("");

/** An object of power, a relic or an artifact, as the book gives it. */
export function toItem(entry, img) {
  const { level, dice } = splitLevel(entry.level);
  return {
    name: entry.name,
    type: "ObjectOfPower",
    img: img || "icons/commodities/treasure/token-gold-gem-red.webp",
    system: {
      level,
      dice,
      description: paragraphs(entry.description),
      depletion: entry.depletion || "",
      objectType: entry.kind,
      form: entry.form || "",
      color: entry.color || ""
    }
  };
}

/**
 * An ephemera object.
 *
 * Its type — conflux, charm, cypher or oddity — is not written here any more
 * than it is on the cards, so it is not written either. A field set to a
 * default is not the same as a field left alone: the first overwrites whatever
 * a GM has put there, and the deck import learned that the expensive way.
 */
export function toEphemeraItem(entry, img) {
  const { level, dice } = splitLevel(entry.level);
  return {
    name: entry.name,
    type: "Ephemera",
    img: img || "icons/commodities/treasure/token-gold-gem-red.webp",
    system: {
      level,
      dice,
      description: paragraphs(entry.description),
      depletion: entry.depletion || "",
      form: entry.form || "",
      color: entry.color || ""
    }
  };
}
