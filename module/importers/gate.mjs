/**
 * Invisible Sun — the Sooth card write-ups, out of The Gate.
 *
 * The cards themselves carry only a name, a value and their suns. Everything
 * that makes one usable at the table — what it means, what it says as a
 * divination, and what it hands the GM as narrative, Joy and Despair — is
 * written up in The Gate, one card to a page.
 *
 * ── Why the page cannot simply be read top to bottom ──
 * These pages are set in two columns around a circular illustration, so the
 * text wraps and both columns' inner edges move line by line. Reading in
 * document order interleaves them, and the result is two half-sentences
 * spliced together on every line. The columns have to be separated by where
 * they sit on the page and then read one after the other — the right column
 * opens mid-sentence, continuing the Divination the left ran out of room for.
 *
 * ── And what is printed over the art ──
 * The card's name is set letter by letter in a wide arc across the middle of
 * the page, and its value and rank are printed on the illustration too. All of
 * that arrives as text and none of it is prose. It is discarded by recognising
 * it rather than by cutting a hole in the page, because the arc's letters
 * wander into both columns.
 */

/** Runs further apart than this are different columns, not the same sentence. */
const COLUMN_GAP = 18;

/** Baselines closer than this are one line: a label and its value sit a half
 *  point apart. */
const LINE_TOLERANCE = 2;

/** Left of this is the left column; the art and the right column are beyond. */
const LEFT_EDGE = 300;

/**
 * How far across the page the illustration reaches.
 *
 * Set from the pages themselves rather than by eye. Of the 1,342 single
 * characters printed across the sixty card pages, 1,177 fall between x=320 and
 * x=400 — that is the name arced over the art — and a further 60, exactly one
 * per page, sit near x=220, which is the value stamped on the illustration.
 * A band starting at 300 caught the first and missed the second, so a stray
 * digit kept turning up mid-sentence: "what would a knife slice away from us?
 * 8 What would it expose?"
 *
 * The left column's text begins at x≈72 and always arrives as whole phrases,
 * so widening to 180 cannot swallow prose: nothing legitimate in this band is
 * one character wide.
 */
const ART_BAND = [180, 560];

/**
 * Where the page's text block sits, left edge to right.
 *
 * Cross-references are set vertically down the outer margin — "Conjure" runs
 * from y=305 to y=320 at x=19, one letter at a time — and they are no more
 * body text than the arc is. Read in document order they land in the middle of
 * whatever sentence they happen to sit beside: "or it might o n j u r
 * self-criticism". The left column begins at x≈72, so anything a single
 * character wide outside these bounds is furniture.
 */
const TEXT_BLOCK = [60, 660];

/**
 * How far below the body the closing aside sits, as a multiple of the page's
 * own line spacing.
 *
 * The aside is set across the foot of the page, clear of both columns, and the
 * temptation is to find it by its height — "anything below y=580". That is a
 * measurement of one book at one page size, and it breaks quietly: The Gate's
 * pages are 720 points tall rather than 792, so a threshold that looked like
 * three quarters of the way down actually cut through the last two lines of
 * Despair, and they were silently filed as the aside instead.
 *
 * What really marks the aside is the gap above it. Body lines are one line
 * apart; the aside sits clear of them. That is true whatever size the page is.
 *
 * The multiple is set from what the book actually does rather than from what
 * looks generous: across the sixty card pages the gap above the aside runs
 * from 33 points to 93, against a 15-point line. So it has to be under 2.2
 * lines to catch the tightest of them, and over 1 to not cut the body into
 * pieces. Anywhere in that band works; this sits in the middle of it.
 */
const ASIDE_GAP_LINES = 1.6;

/** How many lines the closing aside may run to. Two is usual; beyond a few
 *  and what is being looked at is a paragraph, not an aside. */
const MAX_ASIDE_LINES = 4;

const LABELS = ["Value", "Meanings", "Divination", "Game Narrative", "Joy", "Despair"];
const LABEL_RE = new RegExp(`\\b(${LABELS.join("|")}):`, "g");
const LABEL_START_RE = new RegExp(`^(${LABELS.join("|")}):`);

const SUNS = new Set(["Silver", "Green", "Blue", "Indigo", "Grey", "Pale", "Red", "Gold", "Invisible"]);

const FOOTER_RE = /^(\d{1,3}|Darryn van Someren.*|.*@.*|The Sooth Deck|The Gate)$/;

/**
 * What a royalty card does.
 *
 * A plain card's mechanical effect is its sun shift, which the card itself
 * states. A royalty card's is set by its rank and is printed once in the
 * deck's rules rather than on each card's page, so it is filled in from the
 * rank rather than read off the page that does not carry it.
 */
const RANK_EFFECTS = {
  sovereign: "+1 to all actions, +2 if heart is linked to family",
  nemesis: "−1 to all actions, −2 if heart is linked to family",
  defender: "+2 to all actions if heart is linked to family",
  apprentice: "−1 to all actions if heart is linked to family",
  companion: "Duplicates the effects of the previously played card. If played first "
           + "in a session on the Silver Sun, immediately play another card on the next sun.",
  adept: "Play another card on the next sun."
};

const squash = (s) => (s ?? "").replace(/\s+/g, "").toLowerCase();

/** How many lines a quick-meanings list can run to. Two in the layout; a third
 *  is slack. Past that, something has been read as the list that is not it. */
const MAX_MEANING_LINES = 3;
const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim();

/**
 * Drop the letters of the name arced over the illustration.
 *
 * The card's name is set letter by letter in a wide curve, so it arrives as
 * single characters scattered across the middle of the page. They have to go
 * before anything is joined up: once a stray "d" has been merged into the
 * sentence beside it, the run reads "Someone is cast out. S d e e h p i n a A
 * demon or spirit is banished", and no test applied afterwards can tell which
 * part was the arc.
 */
function withoutArcLetters(items, card) {
  /* Both the name and, on a royalty card, the rank are set this way — the
   * Ambassador's page arcs "Adept" beneath the art as well as "Ambassador"
   * above it, and its letters are no more prose than the name's. */
  const arced = [squash(card?.name), squash(card?.rank)].filter(Boolean);
  return items.filter(i => {
    const text = i.str.trim();
    if (text.length > 3) return true;

    const x = i.transform[4];

    // A lone character in the margin is a vertical cross-reference.
    if (text.length === 1 && (x < TEXT_BLOCK[0] || x > TEXT_BLOCK[1])) return false;

    if (x < ART_BAND[0] || x >= ART_BAND[1]) return true;

    /* A lone character in the middle of the page is a letter off the arc, and
     * it does not matter which word it came from. Matching against the name
     * and rank was not enough: the arc also carries the suns, the family, and
     * on some pages a word that appears nowhere in the card's own data, so
     * letters kept leaking into sentences one at a time — "takes much longer C
     * than expected". Body text arrives as whole phrases; nothing legitimate
     * in this band is one character wide. */
    if (text.length === 1) return false;

    const flat = squash(text);
    return !arced.some(word => word.includes(flat));
  });
}

/** A page's text, grouped into lines, each line a list of column runs. */
function pageLines(items, height) {
  const placed = items
    .filter(i => i.str.trim() !== "")
    .map(i => ({
      x: i.transform[4],
      y: height - i.transform[5],
      end: i.transform[4] + i.width,
      text: i.str.trim()
    }))
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const lines = [];
  for (const item of placed) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - item.y) <= LINE_TOLERANCE) last.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  }
  return lines;
}

/**
 * Join a line's pieces into column runs.
 *
 * pdf.js hands back a line already broken into pieces — a label and its value
 * arrive separately — so neighbouring pieces are rejoined where the gap is
 * ordinary word spacing, and left apart where it is the width of a column.
 *
 * Where the left column's text runs long the two can end up a single space
 * apart and merge anyway. A label never appears mid-sentence, so one found
 * inside a run marks where the right column really began.
 */
function columnRuns(items) {
  const runs = [[items[0]]];
  for (const item of items.slice(1)) {
    const previous = runs[runs.length - 1];
    if (item.x - previous[previous.length - 1].end > COLUMN_GAP) runs.push([item]);
    else previous.push(item);
  }

  const split = [];
  for (const run of runs) {
    let cut = null;
    for (let i = 1; i < run.length; i++) {
      if (LABEL_START_RE.test(run.slice(i).map(w => w.text).join(" "))) { cut = i; break; }
    }
    if (cut) split.push(run.slice(0, cut), run.slice(cut));
    else split.push(run);
  }
  return split.map(run => ({
    x: run[0].x,
    text: run.map(w => w.text).join(" ")
  }));
}

/** True if this run is something printed over the illustration, not prose. */
function isArt(run, card) {
  const flat = squash(run.text);
  if (!flat) return true;
  if (flat === squash(card.name)) return true;
  if (flat === String(card.value)) return true;
  if (card.rank && flat === card.rank.toLowerCase()) return true;

  const words = run.text.split(/\s+/).filter(Boolean);
  if (words.length && words.every(w => SUNS.has(w))) return true;

  /* The name is set letter by letter in a wide arc, so it arrives as fragments
   * spread across the middle of the page — "Assassin" as "A s s" and "in".
   * Any fragment of the name found in that band belongs to the arc. */
  if (run.x >= ART_BAND[0] && run.x < ART_BAND[1]) {
    return squash(card.name).includes(flat);
  }
  return false;
}

/** Assemble one card's page: the two columns in reading order, and the aside. */
export function readPage(items, height, card) {
  const lines = [];
  for (const line of pageLines(withoutArcLetters(items, card), height)) {
    const runs = columnRuns(line.items)
      .filter(run => !FOOTER_RE.test(run.text.trim()) && !isArt(run, card));
    if (runs.length) lines.push({ y: line.y, runs });
  }
  if (!lines.length) return { text: "", quote: "" };

  /* The aside is whatever sits below the one large vertical gap on the page.
   * Ordinary line spacing is the yardstick, taken from this page rather than
   * assumed, so a book set more loosely or more tightly is read the same way. */
  const gaps = lines.slice(1).map((l, i) => l.y - lines[i].y).filter(g => g > 0);
  const spacing = gaps.length ? gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 15;

  /* Searched for, not stopped at. The aside runs to two lines on plenty of
   * cards, set at ordinary spacing, so walking back from the foot and giving
   * up at the first normal gap never reaches the large one above it — and the
   * aside is then read as the last paragraph of the description. */
  let asideFrom = lines.length;
  for (let i = lines.length - 1; i > 0 && lines.length - i <= MAX_ASIDE_LINES; i--) {
    if (lines[i].y - lines[i - 1].y > spacing * ASIDE_GAP_LINES) { asideFrom = i; break; }
  }

  const body = lines.slice(0, asideFrom);
  const quote = lines.slice(asideFrom)
    .filter(l => l.runs.length === 1)
    .map(l => l.runs[0].text)
    .join(" ");

  const left = [], right = [];
  for (const { runs } of body) {
    if (runs.length === 1) (runs[0].x < LEFT_EDGE ? left : right).push(runs[0].text);
    else {
      left.push(runs[0].text);
      right.push(runs[runs.length - 1].text);
    }
  }
  return { text: [...left, ...right].join("\n"), quote };
}

/**
 * Split the assembled page into its labelled blocks.
 *
 * The meanings are a comma-separated list the page sets on its own line, and
 * the flavour prose starts on the next with no label of its own. Line breaks
 * are what separates them: the list continues onto another line only while it
 * is still hanging on a comma.
 */
export function parseEntry(text) {
  // The family line is the only one with bullets: "Secrets • Ravens • Books".
  const familyMatch = text.match(/([A-Z][a-z]+(?:\s*•\s*[A-Za-z]+){2,})/);
  const familyLine = familyMatch ? familyMatch[1].trim() : "";
  if (familyLine) text = text.replace(familyLine, " ");

  const marks = [...text.matchAll(LABEL_RE)].map(m => ({ at: m.index, label: m[1] }));
  const fields = {};
  for (const [i, mark] of marks.entries()) {
    const end = i + 1 < marks.length ? marks[i + 1].at : text.length;
    fields[mark.label] = text.slice(mark.at + mark.label.length + 1, end).trim();
  }

  let prose = "";
  if (fields.Meanings) {
    const lines = fields.Meanings.split("\n");
    const taken = [lines[0].trim()];

    while (taken.length < lines.length && taken.length < MAX_MEANING_LINES) {
      const next = lines[taken.length].trim();
      // The list plainly continues: the line before it ended on a comma.
      const hanging = taken[taken.length - 1].endsWith(",");
      /* Or the column broke an item in half — "insanity, inner / turmoil".
       * Ten of the sixty cards do this, and hanging on a comma does not catch
       * them: the break lands inside an item rather than between two. A line
       * opening in lower case cannot be the start of the prose, since that
       * always begins a sentence, and a keyword list never contains a full
       * stop — so a line with one is prose whatever case it opens in. */
      const broken = /^[a-z]/.test(next) && !next.includes(".");
      if (!hanging && !broken) break;
      taken.push(next);
    }

    fields.Meanings = taken.join(" ");
    prose = lines.slice(taken.length).join(" ");
  }
  return { fields, familyLine, prose };
}

/** The write-up for one card, as the fields the item carries. */
export function entryFor(items, height, card) {
  const { text, quote } = readPage(items, height, card);
  const { fields, familyLine, prose } = parseEntry(text);

  return {
    meanings: clean(fields.Meanings),
    divination: clean(fields.Divination),
    gameNarrative: clean(fields["Game Narrative"]),
    joy: clean(fields.Joy),
    despair: clean(fields.Despair),
    description: clean(prose),
    quote: clean(quote),
    familyLine: clean(familyLine),
    effectText: RANK_EFFECTS[(card.rank || "").toLowerCase()] ?? "",
    /* The page restates the value and the family, which the card already gave
     * us. Kept so they can be checked against it rather than merely believed. */
    statedValue: clean(fields.Value)
  };
}

/** True if a page's text is a Sooth card write-up. */
export const isCardPage = (text) => /\bMeanings:/.test(text);

/**
 * Which card's page this is.
 *
 * Its name is set as a heading in capitals above the illustration. This has to
 * happen before the page is read, because knowing the card is what lets the
 * name arced over the art be told from the prose — so it matches against the
 * cards already imported rather than trying to work out what a card name looks
 * like.
 */
export function identifyCard(items, byName) {
  for (const item of items) {
    const found = byName.get(squash(item.str));
    if (found) return found;
  }
  return null;
}

/**
 * Read every card write-up in the book.
 *
 * The pages are found by what is on them rather than by counting: one card to
 * a page, and every one of them names its Meanings. That survives a reprint
 * that shifts the chapter, and it also means the front matter, the contents
 * and the rules chapters are passed over without having to be listed.
 *
 * `byName` maps a squashed card name to whatever the caller wants back — the
 * cards are already in the compendium by the time this runs, and the name
 * printed on the page is what joins the two.
 */
export async function readEntries(doc, byName, { onProgress } = {}) {
  const PAGES_AT_ONCE = 6;
  const found = [];
  let read = 0;

  for (let start = 1; start <= doc.numPages; start += PAGES_AT_ONCE) {
    const batch = [];
    for (let n = start; n < start + PAGES_AT_ONCE && n <= doc.numPages; n++) batch.push(n);

    const results = await Promise.all(batch.map(async (n) => {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      if (!isCardPage(content.items.map(i => i.str).join(" "))) return null;

      const card = identifyCard(content.items, byName);
      if (!card) return { page: n, card: null };

      const height = page.getViewport({ scale: 1 }).height;
      return { page: n, card, entry: entryFor(content.items, height, card) };
    }));

    for (const result of results) if (result) found.push(result);
    read += batch.length;
    onProgress?.({ done: read, total: doc.numPages, found: found.length });
  }
  return found;
}
