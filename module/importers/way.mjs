/**
 * Invisible Sun — the flux charts, out of The Way.
 *
 * Three charts of suggested effects, sized by how many magic dice were cast:
 * "The GM determines the flux effect and immediately turns a new Sooth card"
 * (The Way, p13). Determines, so the charts are a menu rather than a table to
 * roll on, and an entry carries no number.
 *
 * ── What the page gives, and what it does not ──
 * The charts are zebra-striped rows, which is how a reader tells one entry from
 * the next by eye. Nothing of that survives text extraction, so the break has
 * to come from the type itself.
 *
 * It comes from the leading. A line wrapped inside an entry sits 13 points
 * below the one before it; a line that starts a new entry sits 14 to 16 below.
 * One point of difference, but it is consistent down both columns of both
 * pages, and it is the only signal there is.
 *
 * Sentence endings are not that signal, though they look like one. Three
 * entries would be split by it: "Memory lapse. You lose 2 points of Hidden
 * Knowledge" is one entry with a full stop in the middle, "Until the next full
 * moon… returns to water form" runs to three lines and two sentences, and "The
 * fabric of space or time is permanently ripped asunder. / Creatures from other
 * realms can come and go." is one entry whose two sentences each end a line.
 * The leading gets all three right.
 *
 * ── What is set apart from the columns ──
 * The chart headings are outdented four points from their column — 72 against
 * an anchor of 76, 369 against 373 — so book-page.mjs drops them along with the
 * asides, and they are found separately from the words. The same outdent takes
 * the italic note at the foot of the major chart out for free.
 *
 * The cross-reference boxes at the foot of the grand chart are not outdented
 * and do survive, so they are turned away by their size: they are set at nine
 * points where the charts are set at ten.
 */
import { columnAnchors, columnLines, isHeading, pageWords } from "./book-page.mjs";
import { sideEffectsReader, mishapsReader, effectsReader } from "./matrix-tables.mjs";

/** "MINOR FLUX CHART ( )" — the glyphs in the parentheses do not extract. */
const CHART_RE = /^(MINOR|MAJOR|GRAND)\s+FLUX\s+CHART/i;

/** The charts are set at ten points; the reference boxes beside them at nine. */
const BODY_HEIGHT = 9.5;

/**
 * How far a chart heading may sit left of its column and still belong to it.
 *
 * Measured at four points on both pages. Six is clear of that without reaching
 * the previous column, whose anchors are hundreds of points away.
 */
const HEADING_OUTDENT = 6;

/**
 * Split one column's lines into entries.
 *
 * Pure, and the whole of the difficult part: everything else is deciding which
 * lines to hand it.
 *
 * @param {Array}  lines    {y, text}, top to bottom, one column's worth
 * @param {number} leading  the wrap leading in points
 * @returns {string[]} one string per entry
 */
export function splitEntries(lines, leading) {
  const entries = [];
  let current = null;
  let previous = null;

  for (const line of lines) {
    const wrapped = previous !== null && (line.y - previous) <= leading + 0.5;
    if (wrapped && current) current.push(line.text);
    else entries.push(current = [line.text]);
    previous = line.y;
  }
  return entries.map(parts => parts.join(" ").replace(/\s+/g, " ").trim()).filter(Boolean);
}

/**
 * The wrap leading, measured rather than assumed.
 *
 * The smallest step between two lines of a column is a wrap; anything larger is
 * the space the layout puts between entries. Taken across the whole page so a
 * column that happens to hold no wrapped entry still gets the right answer.
 *
 * Null when the page offers nothing to measure — a page of one-line entries
 * has no wrap to find, and guessing one would invent breaks that are not there.
 */
export function wrapLeading(columns) {
  let smallest = null;
  let largest = null;
  for (const lines of columns) {
    for (let i = 1; i < lines.length; i++) {
      const gap = lines[i].y - lines[i - 1].y;
      if (gap <= 0) continue;
      if (smallest === null || gap < smallest) smallest = gap;
      if (largest === null || gap > largest) largest = gap;
    }
  }
  /* Every gap the same means no wrapped entry was found, so there is no
   * leading to distinguish — each line stands alone. */
  return (smallest === null || smallest === largest) ? null : smallest;
}

/**
 * A reader fed one page at a time.
 *
 * The current chart carries across columns and pages: the minor chart runs down
 * the first column and on into the top of the second, and the major chart ends
 * a page after it begins. Only a heading changes it.
 */
export function reader() {
  const found = [];
  let intensity = null;
  let page = null;
  let finished = false;

  return {
    page(words, n) {
      if (finished) return;
      const columns = columnAnchors(words);
      if (!columns) return;

      /* The headings, which columnLines has dropped. Each belongs to the last
       * column starting at or before it, allowing for the outdent. */
      const headings = [];
      const seen = [];
      for (const w of [...words].sort((a, b) => a.y - b.y || a.x - b.x)) {
        const line = seen.find(l => Math.abs(l.y - w.y) < 2.5);
        if (line) line.words.push(w); else seen.push({ y: w.y, words: [w] });
      }
      for (const line of seen) {
        const text = line.words.map(w => w.text).join(" ").trim();
        const match = CHART_RE.exec(text);
        if (!match) continue;
        const x = Math.min(...line.words.map(w => w.x));
        let column = -1;
        for (let c = 0; c < columns.length; c++) {
          if (x >= columns[c] - HEADING_OUTDENT) column = c;
        }
        if (column >= 0) headings.push({ column, y: line.y, intensity: match[1].toLowerCase() });
      }

      const bodies = columns.map((_, c) =>
        columnLines(words, columns, c).filter(l => l.h >= BODY_HEIGHT));
      const leading = wrapLeading(bodies);

      for (let c = 0; c < columns.length; c++) {
        const mine = headings.filter(h => h.column === c).sort((a, b) => a.y - b.y);
        const lines = bodies[c];
        let from = 0;

        /* A column may hold the tail of one chart and the head of the next, so
         * it is cut at each heading rather than assigned whole. */
        for (const heading of [...mine, null]) {
          const to = heading ? lines.findIndex((l, i) => i >= from && l.y > heading.y) : lines.length;
          let slice = lines.slice(from, to === -1 ? lines.length : to);

          if (intensity && leading !== null) {
            /* Where the charts stop.
             *
             * A chart heading is outdented and has been dropped already; an
             * ordinary one is not, and survives. So a heading still standing
             * inside a chart is the chapter carrying on — "CREATING NEW
             * MAGICAL PRACTICES", the page after the grand chart — and
             * everything from it belongs to somebody else.
             *
             * Only tested once a chart is open. Tested before one is, it fired
             * on the headings of every page leading up to the charts and the
             * reader finished before it had started. */
            const stop = slice.findIndex(isHeading);
            if (stop !== -1) { slice = slice.slice(0, stop); finished = true; }

            for (const text of splitEntries(slice, leading)) {
              found.push({ kind: "flux", intensity, text, page: page ?? n });
            }
            if (finished) return;
          }
          if (!heading) break;
          intensity = heading.intensity;
          page = n;
          from = to === -1 ? lines.length : to;
        }
      }
    },
    /** How many so far, for the progress line. */
    count() { return found.length; },
    done() { return found; }
  };
}

/** Every flux effect in the book. */
export async function readEntries(doc, { onProgress } = {}) {
  /* Everything this book has to give, in one walk of it.
   *
   * The flux charts were the first thing read out of The Way and for a while
   * the only one. The Maker's Matrix wants three more lists off it -- the
   * Effects by Level table and the two lists a bad roll sends a Maker to -- and
   * they arrive here rather than as a source of their own, because a file is
   * identified once and a book cannot be two sources at the same time.
   *
   * One pass rather than four. Laying out a page's text is nearly the whole
   * cost of reading it, so every reader is handed the same page and each takes
   * what it recognises. */
  const readers = [
    reader(),
    sideEffectsReader(),
    mishapsReader(),
    effectsReader()
  ];

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const { height } = page.getViewport({ scale: 1 });
    const words = pageWords((await page.getTextContent()).items, height);
    for (const read of readers) read.page(words, n);
    /* `found` is what the importer's progress line reports; without it the
     * reader said "undefined found" once a page in twenty-four. Counted across
     * every reader, because they are all filling the same book's buckets. */
    onProgress?.({ done: n, total: doc.numPages,
                   found: readers.reduce((n2, r) => n2 + r.count(), 0) });
  }

  return readers.flatMap(read => read.done());
}

/**
 * What an entry does that the sheet can do for you.
 *
 * Read here, once, against the English these charts were written in — the same
 * place and for the same reason orders.mjs reads a degree's entitlements. Doing
 * it when the effect is used would mean running a regex over prose every time,
 * and this system already has the scar from that: caps derived at runtime
 * dropped silently to the base the first time a sentence was reworded.
 *
 * Deliberately incomplete, and refuses more than it takes. Of the fifteen
 * entries that mention a number and a game term, five are none of the sheet's
 * business:
 *
 *   "Someone close to you suffers 1 Wound"   — not the vislae who fluxed
 *   "Someone close to you suffers 2 damage"  — likewise
 *   "…gain 1 Wound whenever a Sooth card is played on a specific sun"
 *                                            — a standing curse, not a change
 *   "…gain 4 in your Sortilege pool. However, you can never refresh that pool
 *    again."                                 — a gain the system can model and
 *                                              a permanent condition it cannot
 *   "All of your spells cost 1 additional Sorcery for a short amount of time."
 *                                            — an ongoing modifier
 *
 * Applying any of those would be worse than applying none: a Wound on the
 * wrong character is a mistake somebody has to notice before they can undo it.
 * So a sentence carrying a qualifier is left alone and stays prose for the GM.
 */
const NOT_OURS = /someone close to you|whenever|however|for a short amount of time/i;

/**
 * The phrasings the charts actually use. Two for vex, because the book says
 * both "You gain 3 vex to your Sorcery pool" and "Sudden pain adds 3 vex to
 * your Movement pool", and a parser that knew only the first missed one entry
 * without saying so.
 */
const EFFECTS = [
  { re: /\bgain (\d+) vex to (?:your )?([A-Za-z]+)\b/i,
    make: (m) => ({ kind: "vex", pool: m[2].toLowerCase(), amount: Number(m[1]) }) },
  { re: /\badds (\d+) vex to (?:your )?([A-Za-z]+)\b/i,
    make: (m) => ({ kind: "vex", pool: m[2].toLowerCase(), amount: Number(m[1]) }) },
  { re: /\byou lose (\d+) ([A-Za-z]+) out of your pool\b/i,
    make: (m) => ({ kind: "pool", pool: m[2].toLowerCase(), amount: -Number(m[1]) }) },
  { re: /\byou lose (\d+) points? of Hidden Knowledge\b/i,
    make: (m) => ({ kind: "hiddenKnowledge", pool: "", amount: -Number(m[1]) }) },
  { re: /\byou suffer (\d+) (Anguish|Wound)\b/i,
    make: (m) => ({ kind: m[2].toLowerCase(), pool: "", amount: Number(m[1]) }) },
];

/** The pools a vex or a loss may name; anything else is not one. */
const POOLS = () => new Set([...CONFIG.ISUN.certesPoolNames, ...CONFIG.ISUN.qualiaPoolNames]);

/**
 * @param {string} text  the entry as printed
 * @returns {Array} zero or one effect; the charts never state two
 */
export function effectsIn(text) {
  if (NOT_OURS.test(text)) return [];
  for (const { re, make } of EFFECTS) {
    const match = re.exec(text);
    if (!match) continue;
    const effect = make(match);
    /* A pool the system does not have is a phrase that happened to fit the
     * shape — better nothing than a vex written to a key nothing reads. */
    if (effect.pool && !POOLS().has(effect.pool)) return [];
    return [effect];
  }
  return [];
}

/**
 * Which bucket an entry sorts into.
 *
 * Every reader tags what it found, because this book now yields four different
 * kinds of thing and they go to two different packs. A flux entry is an Item in
 * the flux compendium; the three tables are RollTables.
 */
export const sort = (entry) => entry.kind ?? "flux";

/**
 * One flux effect.
 *
 * Named by its own text, since the book gives these no names and a chart of a
 * hundred unnamed rows cannot be matched on a re-import otherwise. Long ones
 * are cut at a word boundary, and the whole text is kept in the description.
 */
export function toItem(entry) {
  return {
    name: shorten(entry.text),
    type: "Flux",
    img: "icons/magic/lightning/bolt-strike-blue.webp",
    system: {
      intensity: entry.intensity,
      description: `<p>${entry.text}</p>`,
      effects: effectsIn(entry.text),
      source: "The Way",
      page: entry.page
    }
  };
}

/** How long a name may run before it is cut. */
const NAME_MAX = 64;

function shorten(text) {
  const clean = text.replace(/\s+/g, " ").trim().replace(/\.$/, "");
  if (clean.length <= NAME_MAX) return clean;
  const cut = clean.slice(0, NAME_MAX);
  const space = cut.lastIndexOf(" ");
  return `${(space > 20 ? cut.slice(0, space) : cut).trim()}…`;
}
