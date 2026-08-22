/**
 * Invisible Sun — reading a spell deck.
 *
 * These decks are read, not looked at: a card is a name, a level, a
 * description and a few labelled fields, and none of that is a picture. So
 * nothing here renders a page. The text layer carries everything, which makes
 * this both faster than cutting card images and immune to the thing that
 * defeats pixel detection on these sheets — the cards are printed hard against
 * each other with no white gutter, so there is no gap to find them by.
 *
 * ── How the columns are found ──
 * Projecting the text onto the x axis almost works, but card names are centred
 * and a long one reaches the card's edge, closing the gap beside it. The
 * labelled lines are steadier: every card prints "Level:" at its left text
 * margin, so those x positions give the grid. The decks share a card template
 * and differ only in how many fit across a sheet, so measuring the pitch is
 * enough to handle all of them — the main deck prints four across, the Vance
 * deck three.
 */

/** Two anchors closer together than this belong to the same card. */
const MIN_PITCH = 60;

/** Slack added to each side of a measured column. */
const PAD = 4;

/** Baselines closer than this are the same line. */
const LINE_TOLERANCE = 2;

/**
 * Pieces this far apart have a word space between them.
 *
 * Punctuation abuts the word before it at a gap of exactly zero, and the
 * tightest real word space measured on these cards is under half a point — so
 * the boundary sits just above nothing. Set it at half a point instead and one
 * spell in three hundred reads "theNoösphere".
 */
const SPACE_GAP = 0.05;

/** Every card prints one of these at its left text margin. */
const ANCHOR_RE = /^(Level|Form|Type|Depletion|Colou?r):$/;

const FIELD_RE = /^(Level|Depletion|Colou?r|Facets?|Cost|Range|Duration|Form)\s*:\s*(.*)$/i;

/** A name line is all capitals. The card-count furniture ("1 OF 4") is not. */
const NAME_RE = /^[A-Z][A-Z '’\-,!]{2,30}$/;
const NOISE_RE = /^(TM and ©|Permission granted|This page left|\d+\s*OF\s*\d+$)/i;

/** Fields whose value can run onto the next line. Colour and Facet are always
 *  one word, so a line after them starts the card's closing note. */
const CONTINUABLE = new Set(["level", "depletion"]);

/** The copyright line runs the full width of the sheet rather than sitting in
 *  a card, so it is cut away by height. Several of its words also occur in
 *  ordinary card text — Corpus Replica's description uses "duplicate" — so one
 *  hit is not enough; the real footer puts them all on one baseline. */
const FOOTER_WORDS = new Set(["©2019", "©2018", "trademarks", "Permission", "duplicate"]);

const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim();

/** Text items placed top-down, in reading order. */
function placed(items, height) {
  return items
    .filter(i => i.str.trim() !== "")
    .map(i => ({
      x: i.transform[4],
      end: i.transform[4] + i.width,
      y: height - i.transform[5],
      text: i.str.trim(),
      /* Kept untrimmed for joining. These pages are ordinary prose, and pdf.js
       * hands back the spaces inside the pieces — "the " then "Noösphere", and
       * "Void" then ". Opening". Trimming each piece and putting a space
       * between them gets both wrong at once: "theNoösphere" and "Void .". */
      raw: i.str
    }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Measure the card columns on a page, and how far down the cards run.
 *
 * Returns null where the page holds no cards, which is how the backs and the
 * front matter are passed over without having to be counted or listed.
 */
export function findColumns(items, width, height) {
  const words = placed(items, height);
  if (!words.length) return null;

  const footerLines = new Map();
  for (const w of words) {
    if (!FOOTER_WORDS.has(w.text)) continue;
    const key = Math.round(w.y);
    footerLines.set(key, (footerLines.get(key) ?? 0) + 1);
  }
  const footer = [...footerLines].filter(([, n]) => n >= 2).map(([y]) => y);
  const usable = footer.length ? Math.min(...footer) - 1 : height;

  const anchors = words.filter(w => ANCHOR_RE.test(w.text)).map(w => w.x).sort((a, b) => a - b);
  if (!anchors.length) return null;

  const lefts = [];
  for (const x of anchors) if (!lefts.length || x - lefts[lefts.length - 1] > MIN_PITCH) lefts.push(x);

  // A sheet holding a single column needs no grid: take the whole page.
  if (lefts.length === 1) return { columns: [{ x: 0, w: width }], usable, pitch: width };

  const pitch = Math.min(...lefts.slice(1).map((x, i) => x - lefts[i]));
  const origin = (width - lefts.length * pitch) / 2;
  const columns = lefts.map((_, i) => ({ x: Math.max(0, origin + i * pitch - PAD), w: pitch + 2 * PAD }));
  return { columns, usable, pitch };
}

/** One column's text, as lines. */
function columnLines(items, height, column, usable) {
  const inside = placed(items, height)
    .filter(w => w.y < usable && w.x >= column.x && w.x < column.x + column.w);

  const lines = [];
  for (const word of inside) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - word.y) <= LINE_TOLERANCE) last.words.push(word);
    else lines.push({ y: word.y, words: [word] });
  }

  /* Joined by both what the pieces carry and where they sit, because neither
   * alone is right. pdf.js puts a space inside a piece sometimes — "the " then
   * "Noösphere", "Void" then ". Opening" — and at other times leaves it to the
   * position, so "As described in" and "the Key" abut with a real gap between
   * them. Trusting only the text writes "inthe Key"; trusting only the gap
   * writes "Void ." and "theNoösphere". So a space is added only where neither
   * piece already brought one and the two do not touch. */
  const text = lines.map(line => {
    let out = "";
    let previous = null;
    for (const word of line.words) {
      if (previous) {
        const alreadySpaced = /\s$/.test(previous.raw) || /^\s/.test(word.raw);
        if (!alreadySpaced && word.x - previous.end > SPACE_GAP) out += " ";
      }
      out += word.raw;
      previous = word;
    }
    return out.replace(/\s+/g, " ").trim();
  });
  return { text, tops: lines.map(l => l.y / 72) };
}

/**
 * Words a title leaves in lower case unless they open or close it.
 *
 * The cards print their names in capitals — "A CURSE OF FEATHERS" — which is
 * how a card face is set, not how a compendium should list three hundred of
 * them. Capitalising every word instead gives "A Curse Of Feathers", which is
 * not English either.
 */
const SMALL_WORDS = new Set(["a", "an", "and", "the", "of", "with", "to", "in",
                             "for", "or", "from", "on", "at", "by"]);

/** Join a name that wrapped over several lines, and set it in title case. */
function joinName(parts) {
  const words = parts.join(" ").replace(/\s+/g, " ").trim().toLowerCase().split(" ");
  return words.map((word, i) => {
    if (i > 0 && i < words.length - 1 && SMALL_WORDS.has(word)) return word;
    /* After a hyphen, but not after an apostrophe. These names are nearly all
     * possessives — "Abra's Physique", "Zuil's Profuse Admiration" — and
     * capitalising there gives "Abra'S". */
    return word.replace(/(^|-)([a-z])/g, (m, a, b) => a + b.toUpperCase());
  }).join(" ");
}

/**
 * A card reads: name, Level, the description, then the remaining labels.
 *
 * Both the description and a label's value can run to several lines, and they
 * are told apart by position. Level always leads, so an unlabelled line after
 * it starts the description; once a second label appears, everything
 * unlabelled after it continues that label rather than the description.
 */
function parseCard(name, lines) {
  const fields = {};
  const description = [];
  let current = null;

  for (const line of lines) {
    const s = line.trim();
    if (!s || NOISE_RE.test(s)) continue;

    const match = s.match(FIELD_RE);
    if (match) {
      const label = match[1].toLowerCase();
      current = label.startsWith("facet") ? "facet" : (label === "colour" ? "color" : label);
      fields[current] = match[2].trim();
      continue;
    }

    if (current === "level"
      && (fields.level.split("(").length === fields.level.split(")").length)) {
      current = null;               // Level is complete: the description starts.
    } else if (current && !CONTINUABLE.has(current)) {
      current = "note";             // Past the single-word labels.
      fields.note ??= "";
    }

    if (current) fields[current] = `${fields[current]} ${s}`.trim();
    else description.push(s);
  }

  /* A spell card always prints its level. Requiring it is what keeps the
   * cross-references out: the books are named in the margins of some cards —
   * "THE KEY", "THE GATE" — in capitals, which is exactly what a card name
   * looks like, and they were being read as four extra spells. */
  if (!fields.level) return null;

  // "2 (+1 die)" — the level, then the bonus dice it grants.
  const level = (fields.level ?? "").match(/^\s*(\d+)\s*(?:\((.*)\))?\s*$/);
  return {
    name,
    level: level ? level[1] : clean(fields.level),
    dice: level && level[2] ? clean(level[2]) : "",
    description: clean(description.join(" ")),
    depletion: clean(fields.depletion),
    color: clean(fields.color),
    facets: clean(fields.facet),
    note: clean(fields.note)
  };
}

/**
 * Split a column into cards.
 *
 * Each begins with its name in capitals, which may wrap over several lines, so
 * a run of consecutive all-caps lines is one name.
 */
function splitCards(lines, tops) {
  const runs = [];
  for (let i = 0; i < lines.length;) {
    const isName = (l) => NAME_RE.test(l.trim()) && !NOISE_RE.test(l.trim());
    if (!isName(lines[i])) { i++; continue; }
    const start = i;
    const parts = [];
    while (i < lines.length && isName(lines[i])) parts.push(lines[i].trim()), i++;
    runs.push({ start, name: joinName(parts), bodyAt: i });
  }

  const cards = [];
  for (const [n, run] of runs.entries()) {
    const end = n + 1 < runs.length ? runs[n + 1].start : lines.length;
    const card = parseCard(run.name, lines.slice(run.bodyAt, end));
    /* Where the card's first line sits. The Vance deck records a spell's class
     * nowhere but in the size of the card it is printed on, so the grid has to
     * be measured — and the top of a card is where its name starts. "Level:"
     * will not do: it slides down whenever a name wraps to a second line, so
     * its spacing is not the row pitch. */
    if (card) cards.push({ ...card, top: tops[run.start] });
  }
  return cards;
}

/** Every card on one page, in reading order. */
export function readPage(items, width, height) {
  const grid = findColumns(items, width, height);
  if (!grid) return { cards: [], grid: null };
  const cards = grid.columns.flatMap((column) => {
    const { text, tops } = columnLines(items, height, column, grid.usable);
    return splitCards(text, tops).map(card => ({ ...card, left: column.x / 72 }));
  });
  return { cards, grid };
}

/** Group nearly-equal positions, so cards sharing a row or column count once. */
function cluster(values, tolerance) {
  const out = [];
  for (const v of [...values].sort((a, b) => a - b)) {
    if (!out.length || v - out[out.length - 1] > tolerance) out.push(v);
  }
  return out;
}

/**
 * How much slack to allow when deciding two cards share a row.
 *
 * A card's name is set against the bottom of its title area, so a name that
 * wraps to two lines begins about 0.4 inches higher than one that does not.
 * That is the jitter to absorb, and it has to stay well under the tightest
 * real row pitch, which is alpha's 1.7 inches.
 */
const ROW_TOLERANCE = 0.8;

/** The sizes a Vancian spell's card can be, in inches (The Key, p40). */
const CLASS_SIZES = [
  { spellClass: "alpha", width: 3, height: 1.5 },
  { spellClass: "beta",  width: 3, height: 3 },
  { spellClass: "gamma", width: 6, height: 3 },
  { spellClass: "omega", width: 6, height: 6 },
];

const nearest = (value, choices) =>
  choices.reduce((best, c) => Math.abs(c - value) < Math.abs(best - value) ? c : best);

/**
 * Give every card its Vancian class, from the size of the card it is on.
 *
 * The class is a size and nothing else — a Vance prepares whatever fits into a
 * three-inch square — and no card states it in words, so it is measured. The
 * pitch between neighbouring cards gives the card's width across and its
 * height down.
 *
 * Two things make that less simple than it sounds, and both are visible on the
 * sheets rather than assumed:
 *
 *  - **A sheet is not always full.** Where a class runs out mid-sheet, the rest
 *    of the grid is printed as blank cards to write your own on — so the grid
 *    is there but the text is not, and a page left with one row reports no
 *    height at all. Those sheets finish the run they belong to, so the height
 *    carries forward from the last sheet that could be measured.
 *  - **Omega cards are one to a sheet**, so they never show a pitch. What
 *    identifies them is that only one fits: a six-inch-wide sheet holding two
 *    cards is gamma, holding one is omega.
 */
function assignClasses(pages, pageWidth) {
  let carried = null;

  for (const page of pages) {
    const lefts = cluster(page.cards.map(c => c.left), 0.5);
    const tops = cluster(page.cards.map(c => c.top), ROW_TOLERANCE);
    const pitch = (a) => a.length < 2 ? null : Math.min(...a.slice(1).map((v, i) => v - a[i]));

    const width = nearest(pitch(lefts) ?? pageWidth - lefts[0] * 2, [3, 6]);
    const measuredHeight = pitch(tops);

    let height;
    if (measuredHeight != null) height = nearest(measuredHeight, [1.5, 3, 6]);
    else if (width === 6) height = page.cards.length > 1 ? 3 : 6;
    else height = carried?.width === width ? carried.height : null;

    if (height != null) carried = { width, height };
    const match = CLASS_SIZES.find(c => c.width === width && c.height === height);
    for (const card of page.cards) card.spellClass = match?.spellClass ?? "";
  }
}

/**
 * Read a whole deck.
 *
 * A card cut by a column boundary can appear twice, once in each column, and
 * the two copies are not equally complete — so the fuller one wins rather than
 * the later one.
 */
export async function readDeck(doc, { classes = false, onProgress } = {}) {
  const PAGES_AT_ONCE = 6;
  const found = [];
  let grid = null, read = 0, pageWidth = 0;

  for (let start = 1; start <= doc.numPages; start += PAGES_AT_ONCE) {
    const batch = [];
    for (let n = start; n < start + PAGES_AT_ONCE && n <= doc.numPages; n++) batch.push(n);

    const results = await Promise.all(batch.map(async (n) => {
      const page = await doc.getPage(n);
      const view = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      return { page: n, width: view.width / 72, ...readPage(content.items, view.width, view.height) };
    }));

    for (const result of results) {
      if (!result.cards.length) continue;
      found.push(result);
      grid ??= result.grid;
      pageWidth ||= result.width;
    }
    read += batch.length;
    onProgress?.({ done: read, total: doc.numPages,
                  found: found.reduce((n, p) => n + p.cards.length, 0) });
  }

  // Printed order is the order the classes run in, so sort before classifying.
  found.sort((a, b) => a.page - b.page);
  if (classes) assignClasses(found, pageWidth);

  const best = new Map();
  for (const page of found) {
    for (const card of page.cards) {
      const key = card.name.toUpperCase();
      const previous = best.get(key);
      if (!previous || card.description.length > previous.description.length) best.set(key, card);
    }
  }

  return {
    cards: [...best.values()].sort((a, b) => a.name.localeCompare(b.name)),
    grid, sheets: found.length
  };
}

/** The item a spell becomes, matching what build_compendia.js writes. */
export function toItem(spell, img, spellType = "general") {
  return {
    name: spell.name,
    type: "Spell",
    img: img || "icons/magic/symbols/rune-sigil-horned-blue.webp",
    system: {
      level: parseInt(spell.level, 10) || 1,
      color: spell.color || "",
      depletion: spell.depletion || "",
      description: spell.description ? `<p>${spell.description}</p>` : "",
      dice: spell.dice || "",
      facets: spell.facets || "",
      note: spell.note ? `<p>${spell.note}</p>` : "",
      spellType,
      // Vancian spells only; blank on everything else, which has no such limit.
      spellClass: spell.spellClass ?? ""
    }
  };
}
