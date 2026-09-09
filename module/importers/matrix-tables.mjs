/**
 * Invisible Sun — the three tables the Maker's Matrix consults.
 *
 * The Effects by Level table, which says what level an effect is; and the two
 * lists a bad roll sends a Maker to — the side effects worked in by accident,
 * and the mishaps that end the work outright.
 *
 * All three are Monte Cook Games' text, so none of them ships. They are read
 * out of The Way, out of the reader's own copy, the way everything else in this
 * system is.
 *
 * ── What is shared, and what is not ──
 * Splitting a column of prose into entries is the hard part, and it is already
 * solved: `splitEntries` in way.mjs measures the wrap leading and breaks where
 * the layout put a gap. Every list here uses it. What differs between them is
 * only which lines to hand it, which is a question about each page's furniture.
 *
 * ── Why the flat text extraction is no help ──
 * All three pages are two columns, and pdftotext interleaves them by height: on
 * the side-effects page the right column opens with major side effects, and
 * flattened they arrive in the middle of the minor list, reading as though they
 * belonged to it. Read column by column, in order, the layout is ordinary and
 * the lists come out clean. The same trap took two arrows off the Matrix chart
 * itself — see helpers/matrix.mjs.
 */
import { columnAnchors, columnLines } from "./book-page.mjs";
import { splitEntries, wrapLeading } from "./way.mjs";

/** The two lists of side effects, each opening its own section. */
const SIDE_EFFECT_RE = /^(MINOR|MAJOR)\s+SIDE\s+EFFECTS$/i;

/** Where the Effects by Level table begins. */
const EFFECTS_HEADING_RE = /^EFFECTS\s+BY\s+LEVEL\s+TABLE$/i;

/** The mishap list, and the paragraph explaining what a mishap is. */
const MISHAPS_RE = /^MISHAPS$/i;

/**
 * How far a section heading may sit left of its column and still belong to it.
 *
 * Measured at four points on the side-effects page — 72 against an anchor of 76
 * — which is the same outdent the flux charts use, and for the same reason: it
 * is how the book sets a heading over a list.
 */
const HEADING_OUTDENT = 6;

/** Lines whose baselines are this close are one line of the page. */
const LINE_TOLERANCE = 2.5;

/** A horizontal gap this wide is a column gutter, not a word space. */
const SEGMENT_GAP = 40;

/**
 * Group a page's words into lines, left to right along each baseline.
 *
 * A line is a run of words on one baseline *with no column gutter in it*. Both
 * halves matter. Grouped by baseline alone, the two columns of a page fall into
 * the same line and it begins with whichever column sits further left -- which
 * is how every level in a right-hand gutter went missing, half the Effects by
 * Level table, while the other half looked perfectly correct.
 *
 * Splitting on the gap rather than on a computed page middle, because a middle
 * has to be guessed from the words and guesses wrong on a page whose content is
 * all down one side: it then cuts that column in half. A real gutter is some
 * two hundred points of white and no word space is anywhere near it.
 *
 * Walked once against the last segment rather than searched. The words are
 * sorted by baseline, so a word either continues the segment just built or
 * opens a new one -- searching the whole list for each is quadratic, and on a
 * dense page called several times across a ninety-page book it was slow enough
 * that a full read did not finish inside seven minutes.
 */
function linesOf(words) {
  const lines = [];
  for (const w of [...words].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const last = lines[lines.length - 1];
    const sameLine = last && Math.abs(last.y - w.y) < LINE_TOLERANCE;
    const reachable = last && w.x - Math.max(...last.words.map(p => p.x)) < SEGMENT_GAP;
    if (sameLine && reachable) last.words.push(w);
    else lines.push({ y: w.y, words: [w] });
  }
  return lines.map(l => ({
    y: l.y,
    x: Math.min(...l.words.map(w => w.x)),
    h: Math.max(...l.words.map(w => w.h ?? 0)),
    text: l.words.map(w => w.text).join(" ").replace(/\s+/g, " ").trim(),
    words: l.words
  }));
}

/**
 * Which section headings a page carries, and which column each opens.
 *
 * The headings are outdented out of their column, so `columnLines` has already
 * dropped them; they are found here from the words instead. Each belongs to the
 * last column beginning at or before it.
 */
function headingsOn(words, columns, pattern) {
  const found = [];
  for (const line of linesOf(words)) {
    const match = pattern.exec(line.text);
    if (!match) continue;
    let column = -1;
    for (let c = 0; c < columns.length; c++) {
      if (line.x >= columns[c] - HEADING_OUTDENT) column = c;
    }
    if (column >= 0) found.push({ column, y: line.y, match });
  }
  return found;
}

/**
 * The minor and major side-effect lists.
 *
 * Ordinary two-column flow: the minor list fills the first column, the major
 * one begins at its foot and carries on at the top of the second. So the
 * section carries across columns and only a heading changes it — exactly the
 * shape the flux charts have.
 */
export function sideEffectsReader() {
  const found = [];
  let kind = null;

  return {
    page(words) {
      const columns = columnAnchors(words);
      if (!columns) return;

      const headings = headingsOn(words, columns, SIDE_EFFECT_RE);

      for (let c = 0; c < columns.length; c++) {
        const mine = headings.filter(h => h.column === c).sort((a, b) => a.y - b.y);
        const lines = columnLines(words, columns, c);

        /* Each column's own leading. Measured across the page instead, the
         * tighter of the two columns sets the floor and the looser one stops
         * counting its wraps as wraps -- which broke ten major side effects
         * apart at their line ends and left "A new, perfect set grows in the
         * next ten hours." standing on its own as an entry. */
        /* Null means the column gave nothing to measure -- a single line, or
         * every gap the same -- and that is not a reason to abandon it. It says
         * there are no wrapped lines here, which is what splitEntries does with
         * a leading of zero: one entry a line. Bailing out instead lost any
         * column holding a single entry. */
        const leading = wrapLeading([lines]) ?? 0;

        let from = 0;

        /* A column may hold the tail of one list and the head of the next, so
         * it is cut at each heading rather than assigned whole. */
        for (const heading of [...mine, null]) {
          const to = heading
            ? lines.findIndex((l, i) => i >= from && l.y > heading.y)
            : lines.length;
          const slice = lines.slice(from, to === -1 ? lines.length : to);

          if (kind) {
            for (const text of splitEntries(slice, leading)) {
              found.push({ kind: "sideEffects", severity: kind, text });
            }
          }
          if (heading) {
            kind = heading.match[1].toLowerCase();
            from = to === -1 ? lines.length : to;
          }
        }
      }

      /* Both lists live on one page: minor fills the first column, major begins
       * at its foot and ends in the second. Carrying the section on to the next
       * page swept the whole of the Matrix chart and the mishap list into the
       * major list -- seventy-seven entries where there are twenty-four. It
       * carries across columns, which is what the loop above is for, and no
       * further. */
      kind = null;
    },
    /** How many so far, for the progress line. */
    count() { return found.length; },
    done() { return found; }
  };
}

/**
 * The mishap list.
 *
 * Two headings say MISHAPS on this page and only one opens the list: the other
 * opens the paragraph explaining what a mishap is ("Mishaps are when things go
 * terribly, terribly wrong"). They are told apart by where they sit — the list
 * runs down the last column of the page, beside the chart, and the paragraph
 * sits under the chart in the first.
 */
export function mishapsReader() {
  const found = [];

  return {
    page(words) {
      const columns = columnAnchors(words);
      if (!columns || columns.length < 2) return;

      const last = columns.length - 1;
      const heading = headingsOn(words, columns, MISHAPS_RE)
        .filter(h => h.column === last)
        .sort((a, b) => a.y - b.y)[0];
      if (!heading) return;

      const lines = columnLines(words, columns, last).filter(l => l.y > heading.y);

      /* Measured from this column alone. The page it shares is the Matrix chart,
       * whose boxes sit at every spacing there is -- read across the page the
       * smallest gap is a fraction of a line, nothing counts as wrapped, and
       * every mishap arrives broken at its line ends. */
      const leading = wrapLeading([lines]) ?? 0;
      for (const text of splitEntries(lines, leading)) found.push({ kind: "mishaps", text });
    },
    /** How many so far, for the progress line. */
    count() { return found.length; },
    done() { return found; }
  };
}

/**
 * The Effects by Level table.
 *
 * Two columns to a page, and each column is itself two: a narrow gutter holding
 * the level, and the effects beside it. The level is printed once, on the
 * baseline of the first of its effects, and everything below it belongs to that
 * level until the next number appears.
 *
 * -- Why this one does not use columnAnchors --
 * Because the anchors move. On the first two pages of the table they come back
 * as 112 and 409, the effect columns, with the gutter outside them; on the
 * third they come back as 85 and 382, the gutter itself, and `columnLines` then
 * throws the effects away for being indented 25 points past a column that
 * starts 24 in. Four levels vanished that way, and the two that survived were
 * page furniture.
 *
 * So the table is read on its own terms. The levels are found first -- a bare
 * one or two digit number, alone on the left of a line -- and where they sit is
 * what says where the columns are. Everything from a level's own baseline down
 * to the next one's belongs to it.
 *
 * Reading the levels out of the text rather than the position would not do:
 * plenty of effects open with a figure, and a level is a level because of where
 * it sits.
 */

/** How wide a column of this table runs, from its gutter. */
const COLUMN_REACH = 260;

/** A level, alone at the left of its line. */
const LEVEL_RE = /^\d{1,2}$/;

export function effectsReader() {
  const found = [];
  let open = false;
  let done = false;

  return {
    page(words) {
      if (!words.length || done) return;

      /* Every segment on the page. A column gutter has already broken these
       * apart, so a level in a right-hand column opens a segment of its own. */
      const lines = linesOf(words);

      /* A level is a bare number standing at the left of a segment with the
       * effects it heads set in beside it. Both halves matter: a page number in
       * the footer is a bare number alone on its line too, and arrived as a
       * level -- "22" and "15" -- until the second half was insisted on.
       *
       * Tested by looking for the text, not by counting the levels. Requiring
       * two levels to a column was the first attempt and it is wrong: a level
       * whose effects fill a column would be dropped whole and in silence. */
      const marks = lines
        .filter(l => l.words[0] && LEVEL_RE.test(l.words[0].text))
        .filter(l => l.words.some(w =>
          w.x > l.words[0].x + 8 && w.x < l.words[0].x + 60))
        .map(l => ({ y: l.y, x: l.words[0].x, level: Number(l.words[0].text) }));
      /* The table is bounded, and has to be.
       *
       * A level is a bare number with text beside it, and over a hundred and
       * twenty-six pages that describes a great deal that is not this table:
       * numbered lists, stat blocks, price columns. Read across the whole book
       * it returned 571 effects where there are 180, and a level 0 among them.
       *
       * So it opens on its own heading and closes on the first page after that
       * which offers no levels at all -- the table runs over three consecutive
       * pages and nothing else on them looks like it. */
      if (!open && lines.some(l => EFFECTS_HEADING_RE.test(l.text))) open = true;
      if (!open) return;
      if (!marks.length) { done = true; return; }

      /* The gutters, said by the levels themselves: every distinct left edge
       * they stand at. Two on a page of this table, and the loop below reads
       * each as its own column. */
      const gutters = [];
      for (const m of marks) {
        if (!gutters.some(g => Math.abs(g - m.x) <= 4)) gutters.push(m.x);
      }

      for (const gutter of gutters.sort((a, b) => a - b)) {
        const mine = marks.filter(m => Math.abs(m.x - gutter) <= 4)
          .sort((a, b) => a.y - b.y);

        /* The column's own segments: from its gutter across to where the next
         * column begins. A running head or a footer set outside that is not
         * part of the table and never reaches the splitter. */
        const body = lines.filter(l => l.x >= gutter - 1 && l.x < gutter + COLUMN_REACH);
        const leading = wrapLeading([body]) ?? 0;

        for (let i = 0; i < mine.length; i++) {
          /* From this level's own baseline -- it shares one with the first of
           * its effects -- to the next level's, or the foot of the column.
           * Anything above the first level is the table's caption row and is
           * left where it lies. */
          const from = mine[i].y - LINE_TOLERANCE;
          const to = i + 1 < mine.length ? mine[i + 1].y - LINE_TOLERANCE : Infinity;
          const slice = body.filter(l => l.y > from && l.y < to).map(l => ({
            y: l.y,
            /* The level shares a baseline with the first of its effects, so
             * that one line has the number taken off the front of it. */
            text: l.y < mine[i].y + LINE_TOLERANCE
              ? l.words.filter(w => w.x > mine[i].x + 1).map(w => w.text).join(" ")
              : l.text
          })).filter(l => l.text);

          for (const text of splitEntries(slice, leading)) {
            found.push({ kind: "effects", level: mine[i].level, text });
          }
        }
      }
    },
    /** How many so far, for the progress line. */
    count() { return found.length; },
    done() { return found; }
  };
}

/* ──────────────────────────────────────────────
 * WHAT THE ENTRIES BECOME
 * ────────────────────────────────────────────── */

/**
 * Where a table records what the Matrix should use it for.
 *
 * `flags["invisible-sun"].matrixTable` holds `{role, level}` or
 * `{role, severity}` — the role being one of "effects", "sideEffects" or
 * "mishaps". Read back by module/apps/MakerMatrix.mjs, which is the only other
 * place this string may appear.
 *
 * A flag rather than the table's own name. "Effects by Level — 5" is a label,
 * and a GM who renames it to something they prefer, or a translator who
 * translates it, should not thereby make the level 5 effects unfindable. What
 * the table is for is data about the table, so it goes where data goes.
 */
export const TABLE_FLAG = "matrixTable";

/**
 * A roll table, from a list of one-line entries.
 *
 * Every entry weighs the same and the formula spans them, so a table of twenty
 * mishaps is 1d20 and a table of six effects is 1d6. That is the only reading
 * the books support: they print these as lists to choose from or roll on, with
 * no weighting of any kind.
 */
function tableOf(name, description, texts, marks) {
  return {
    name,
    description,
    formula: `1d${Math.max(1, texts.length)}`,
    replacement: true,
    displayRoll: true,
    flags: { "invisible-sun": { [TABLE_FLAG]: marks } },
    results: texts.map((text, i) => ({
      type: "text",
      /* `name` is what a text result shows, and `description` is the HTML under
       * it. These are one-liners, so the line is the name. Foundry moved this
       * field from `text` to `name` in v13; written the old way the whole table
       * rolls blanks. */
      name: text,
      weight: 1,
      range: [i + 1, i + 1]
    }))
  };
}

/**
 * The Effects by Level table, as one table a level.
 *
 * Seventeen tables rather than one of a hundred and eighty, because the
 * question a Maker asks is "what is a level 5 effect" — the level is the index,
 * and a single table could only answer it by being read end to end.
 */
export function effectTables(entries) {
  const byLevel = new Map();
  for (const e of entries) {
    if (!byLevel.has(e.level)) byLevel.set(e.level, []);
    byLevel.get(e.level).push(e.text);
  }
  return [...byLevel.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, texts]) => tableOf(
      `Effects by Level — ${level}`,
      `<p>Effects of level ${level}, from the Effects by Level table in The Way.</p>`,
      texts,
      { role: "effects", level }));
}

/** The two side-effect lists, as two tables. */
export function sideEffectTables(entries) {
  return ["minor", "major"]
    .map(severity => [severity, entries.filter(e => e.severity === severity).map(e => e.text)])
    .filter(([, texts]) => texts.length)
    .map(([severity, texts]) => tableOf(
      `${severity === "minor" ? "Minor" : "Major"} Side Effects`,
      `<p>${severity === "minor" ? "Minor" : "Major"} side effects, worked into an item by an `
      + `error in the Maker's Matrix — or accepted in advance to make the work easier.</p>`,
      texts,
      { role: "sideEffects", severity }));
}

/** The mishaps, as one table. */
export function mishapTables(entries) {
  return [tableOf("Mishaps",
    "<p>What happens when the Maker's Matrix goes wrong: the item is ruined, and "
    + "something befalls the Maker.</p>",
    entries.map(e => e.text),
    { role: "mishaps" })];
}
