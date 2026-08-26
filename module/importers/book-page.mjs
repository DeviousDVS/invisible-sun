/**
 * Invisible Sun — reading a page of one of the books.
 *
 * The decks are cards on a grid; the books are two columns of prose with
 * asides down the middle, and that is a different problem. This is the part of
 * it that is the same in every book, so that a reader for a new chapter starts
 * from the layout rather than from pdf.js.
 *
 * ── Why a line cannot be taken from the page ──
 * The two columns are set to the same baselines, a fraction of a point apart,
 * so gathering a page's words into lines by their y merges them: the left
 * column's sentence and the right column's heading arrive as one line, and
 * "THE OLD MAN" turns up in the middle of a paragraph about the Flame. Words
 * are taken by the column they sit in and only then gathered into lines.
 *
 * ── And why position alone is not enough either ──
 * Asides are set in the gutter between the columns, which is inside the left
 * column's band. What separates them from the body is that the body is set
 * flush: every line of it starts at its column or a step or two in, and an
 * aside starts wherever the shape of it puts it — 240 points along, ragged by
 * design. Where an aside shares a baseline with a line of body text, what is
 * left of it is cut by joinWords, which stops at a gap too wide to be a space.
 */

/** Baselines closer together than this are one line. */
export const LINE_TOLERANCE = 2.5;

/**
 * How far in from its column a line of body text may start.
 *
 * The books use two indents past the column itself — 72, 81 and 90 on the
 * left, 428, 437 and 446 on the right — for paragraph openings and bullet
 * items, and the widest of them measured is 20.5: the character arcs of
 * Explores the Noösphere. At 20 that one bullet fell outside its own column
 * and vanished, so this is set clear of it.
 *
 * There is a great deal of room to be clear by. Nothing else in the text block
 * is flush to anything, and the asides these books set between their columns
 * start 239 points along.
 */
export const INDENT_MAX = 24;

/** Anything indented at all is a continuation or a list item; a paragraph
 *  starts flush, or opens one step in — see the reader for which, since the
 *  books do not agree with each other about it. */
export const PARAGRAPH_SLACK = 3;

/**
 * A gap this wide is not a space between two words but the space between two
 * things.
 *
 * An aside beginning where a line of text left off, or — in The Key's priced
 * tables — a page number set in the outer margin on the same baseline as the
 * last row of a column. Read straight through, page 191 gives a chest of
 * drawers a price of "Match price to other power source of the same level
 * 193". Words in a run of type are two and a half points apart; twenty is
 * nowhere near either.
 */
export const CELL_BREAK = 20;

/** Headings are set larger than the body's 10 points. Not much larger, in some
 *  chapters: the soul allegiances are 12 against a running head of 13, which
 *  is why furniture is excluded by where it sits rather than by its size. */
export const HEADING_HEIGHT = 11.5;

/** Pull a page's text items into the shape the rest of this works in. */
export function pageWords(items, height) {
  return items
    .filter(item => item.str.trim() !== "")
    .map(item => ({
      x: item.transform[4],
      y: height - item.transform[5],
      w: item.width,
      h: item.height || 0,
      /* Which face this word is set in. pdf.js names them per document, so the
       * name means nothing on its own — but a change of it partway along a
       * line means the typography changed there. */
      font: item.fontName,
      text: item.str.trim()
    }));
}

/**
 * Join words into text, stopping where the line stops being one run of type.
 *
 * A wide gap ends it, and so does a narrower gap that changes face. The second
 * is what catches an aside set close: "Cost: Agreeing to Help. You pay a cost
 * of 2 Acumen." is followed 19.5 points later by "You should not have two or",
 * which is a note in the margin — under the width that ends a run outright,
 * but in italic where the line is roman. Emphasis inside a sentence changes
 * face too, so both have to hold: a change of face at an ordinary word space
 * is emphasis, and at eight points is something else on the page.
 */
export function joinWords(words) {
  let out = "";
  let previous = null;
  for (const word of words) {
    if (previous) {
      const gap = word.x - (previous.x + previous.w);
      if (gap > CELL_BREAK) break;
      if (gap > FACE_GAP && word.font !== previous.font) break;
      if (gap > 1) out += " ";
    }
    out += word.text;
    previous = word;
  }
  return out;
}

/** How far apart two words must be before a change of face between them means
 *  a change of purpose rather than emphasis. A word space is two and a half
 *  points. */
const FACE_GAP = 8;

/**
 * One column's lines, top to bottom.
 *
 * `columns` is the x each column starts at, left to right. A word belongs to
 * the column whose band it falls in, and a line to the column it starts in.
 */
export function columnLines(words, columns, index) {
  const from = columns[index];
  const to = columns[index + 1] ?? Infinity;
  const lines = [];

  for (const word of words
    .filter(w => w.x >= from - PARAGRAPH_SLACK && w.x < to - PARAGRAPH_SLACK)
    .sort((a, b) => a.y - b.y || a.x - b.x)) {
    const line = lines.find(l => Math.abs(l.y - word.y) < LINE_TOLERANCE);
    if (line) line.words.push(word);
    else lines.push({ y: word.y, words: [word] });
  }

  return lines
    .map(line => {
      line.words.sort((a, b) => a.x - b.x);
      return {
        y: line.y,
        x: line.words[0].x,
        h: Math.max(...line.words.map(w => w.h)),
        text: joinWords(line.words),
        /* The same line with nothing cut. joinWords stops at the gap where an
         * aside begins, which is right nearly everywhere and wrong where a
         * book sets two values across one line: a heart's "Certes: 9" and
         * "Qualia: 8" are 73 points apart, and read through the cut the second
         * one does not exist. A reader that knows it is looking at such a line
         * can have it whole. */
        raw: line.words.map(w => w.text).join(" ")
      };
    })
    // Flush to the column or a step in; anything else is an aside, a running
    // head, or a page number.
    .filter(line => line.x < from + INDENT_MAX)
    .sort((a, b) => a.y - b.y);
}

/**
 * Where this page's columns begin.
 *
 * The books are not set to one grid. The Key's forte entries run two columns
 * at 72 and 428 for some fortes and 72 and 369 for others — a wider measure
 * with a narrower gutter — and reading a 369 page as a 428 page loses the
 * right column entirely: Cages Adversaries came back with no abilities at all
 * and was dropped for it.
 *
 * Each half of the page is asked where its lines begin. Most begin at the
 * column's own edge, but plenty begin one or two indents in — a paragraph
 * opening, a bullet — and on many pages the indents outnumber the edge: the
 * abilities of Consumes Flesh begin four lines at 428 against fifteen at 443.
 * So the edge is not the most common start but the leftmost start that several
 * lines share. A handful is enough, because a column edge is used by whole
 * paragraphs while a stray indent is used once.
 *
 * Asides in the gutter are excluded by sitting left of the middle. They are
 * also too few to count — a handful of lines against a column's twenty.
 */
export function columnAnchors(words) {
  const lines = [];
  for (const word of words) {
    const line = lines.find(l => Math.abs(l.y - word.y) < LINE_TOLERANCE);
    if (line) line.words.push(word);
    else lines.push({ y: word.y, words: [word] });
  }

  const edge = (half) => {
    const starts = new Map();
    for (const line of lines) {
      const mine = line.words.filter(half);
      if (!mine.length) continue;
      const x = Math.round(Math.min(...mine.map(w => w.x)));
      starts.set(x, (starts.get(x) ?? 0) + 1);
    }
    if (!starts.size) return null;
    if (Math.max(...starts.values()) < COLUMN_LINES) return null;
    return Math.min(...[...starts].filter(([, n]) => n >= EDGE_LINES).map(([x]) => x));
  };

  const left = edge(w => w.x < PAGE_MIDDLE);
  const right = edge(w => w.x >= PAGE_MIDDLE);
  if (left === null) return right === null ? null : [right];
  return right === null ? [left] : [left, right];
}

/** How many lines a column's commonest start needs before the half is taken to
 *  hold a column at all. Below this the half is a diagram or a caption. The
 *  progression diagrams leave some columns very short: the page facing Walks
 *  the Path of Suns has four lines of text beside the drawing. */
const COLUMN_LINES = 4;

/** How many lines have to share a start before it counts as the column's edge
 *  rather than one line that happens to begin there. Three is too few: the
 *  Maker order's opening page has three lines starting at 363, against
 *  twenty-six at the column's real edge of 428, and taking the leftmost of
 *  them put the heading MAKER outside its own column, where it was dropped —
 *  so the Vance order ran on and swallowed the whole of the Maker. */
const EDGE_LINES = 4;

/** Half of a 720-point page, near enough. The asides these books set between
 *  their columns all begin left of it. */
const PAGE_MIDDLE = 350;

/** A heading is set large and in capitals. */
export const isHeading = (line) =>
  line.h >= HEADING_HEIGHT && line.text === line.text.toUpperCase() && /[A-Z]/.test(line.text);

/** SAFE STEP BOOTS → Safe Step Boots; THE CHILD → The Child. */
export function title(text) {
  const small = new Set(["and", "or", "of", "the", "a", "an", "in", "to", "upon"]);
  return text.toLowerCase().split(/\s+/)
    .map((word, i) => (i > 0 && small.has(word))
      ? word : word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
