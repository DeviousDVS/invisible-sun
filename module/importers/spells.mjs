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

import * as deckPdf from "./pdf-deck.mjs";

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
export const NAME_RE = /^[A-Z][A-Z '’\-,!]{2,30}$/;
export const NOISE_RE = /^(TM and ©|Permission granted|This page left|\d+\s*OF\s*\d+$)/i;

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

/**
 * One column's text, as lines — with where each line begins.
 *
 * The left edge matters to anything reading these cards. The decks tell a
 * label's continuation from a new block by indenting it, and pdftotext leaves
 * that as leading spaces to be counted. Here the real coordinate is available,
 * which is both exact and immune to a proportional font making a nonsense of
 * space counting.
 */
export function columnLines(items, height, column, usable) {
  const inside = placed(items, height)
    .filter(w => w.y < usable && w.x >= column.x && w.x < column.x + column.w);

  const lines = [];
  for (const word of inside) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - word.y) <= LINE_TOLERANCE) last.words.push(word);
    else lines.push({ y: word.y, words: [word] });
  }

  /* Sorted across before being joined. The pieces arrive ordered by baseline
   * first, and a line's baseline is not quite one number: a styled run sits a
   * fraction of a point off its neighbours, which is well within the tolerance
   * that groups them into one line but enough to order them by height instead
   * of by position. Joined in that order a sentence comes out shuffled — "The
   * wearer ,can see spirits and invisible things of notbut only at". */
  for (const line of lines) line.words.sort((a, b) => a.x - b.x);

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
  return {
    text,
    tops: lines.map(l => l.y / 72),
    lefts: lines.map(l => l.words[0].x / 72)
  };
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
export function joinName(parts) {
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

/**
 * The classes and their card sizes in inches (The Key, p40), smallest first —
 * which is also the order a deck prints them in, since the sheets are laid out
 * by size.
 *
 * The sizes are used for their proportions rather than their absolute values:
 * a card's width is measured off the sheet, and its height follows from the
 * shape, because rows of backs abut with no gutter to find.
 */
const CLASS_SIZES = [
  { spellClass: "alpha", width: 3, height: 1.5 },
  { spellClass: "beta",  width: 3, height: 3 },
  { spellClass: "gamma", width: 6, height: 3 },
  { spellClass: "omega", width: 6, height: 6 },
];

const CLASS_ORDER = CLASS_SIZES.map(c => c.spellClass);

/**
 * Two sheets share a layout if their blocks of ink agree to within this.
 *
 * It can be this tight because the measurement is exact. The four layouts on
 * this deck come out 9.75x7.00, 9.75x6.50, 6.26x6.50 and 6.26x6.25 — and the
 * last two are a quarter inch apart, which is the whole margin available. A
 * looser figure merges gamma into omega and hands twenty spells the wrong
 * card size.
 *
 * That precision is only available because the hairline trim rules are
 * excluded; while they were being counted, gamma measured 7.00 wide instead of
 * 6.26 and the two separated by accident rather than by measurement.
 */
const LAYOUT_TOLERANCE = 0.15;

/**
 * Work out each card's Vancian class from the deck's card backs.
 *
 * The class is a size and nothing else — a Vance prepares whatever fits into a
 * three-inch square — and no card says which it is in words. The obvious place
 * to measure is the sheet of faces, and it is the wrong one: a sheet is not
 * always full, and where a class runs out the rest of the grid prints as blank
 * cards to write your own on. A gamma sheet holding one spell then looks
 * exactly like an omega sheet, which is a whole card size wrong.
 *
 * The backs have no such problem. A back is a solid printed rectangle, so a
 * sheet of them shows the grid whether or not anyone wrote on the other side —
 * and the block of ink is the grid: wide for the three-across classes, narrow
 * for the six-inch ones, tall for four rows, short for one.
 *
 * The layouts are not compared against measurements written down here. They
 * are collected from the deck, grouped, and named in the order they appear,
 * because a deck prints its classes smallest first. That way a reissue set at
 * a different scale still reads correctly.
 */
async function assignClasses(pages, backs) {
  // Distinct sheet layouts, in the order the deck prints them.
  const layouts = [];
  for (const back of backs) {
    const match = layouts.find(l =>
      Math.abs(l.box.w - back.box.w) <= LAYOUT_TOLERANCE
      && Math.abs(l.box.h - back.box.h) <= LAYOUT_TOLERANCE);
    if (match) match.pages.push(back.page);
    else layouts.push({ box: back.box, pages: [back.page] });
  }

  const named = new Map();
  layouts.forEach((layout, i) => {
    const spellClass = CLASS_ORDER[i] ?? "";
    for (const page of layout.pages) named.set(page, { spellClass, box: layout.box });
  });

  /* A sheet of faces is backed by the page before it. Where that page is not
   * one of the backs — the deck has a blank or two between its runs — the
   * nearest back before it is the one that belongs to it. */
  const classPages = new Map();
  for (const page of pages) {
    let backPage = page.page - 1;
    while (backPage > 0 && !named.has(backPage)) backPage--;
    const found = named.get(backPage);
    if (!found) continue;

    for (const card of page.cards) card.spellClass = found.spellClass;

    if (!classPages.has(found.spellClass)) {
      /* The card's width comes off the sheet — the block of backs divided by
       * how many are across it. Its height comes from the class's own
       * proportions instead, because rows of backs abut with no gutter worth
       * finding, so nothing on the page marks where one card ends and the next
       * begins. The ratio is the rule itself: alpha is twice as wide as it is
       * tall, beta and omega are square, gamma is twice as wide as tall. */
      const shape = CLASS_SIZES.find(c => c.spellClass === found.spellClass);
      /* How many cards are across the sheet. Counting the gaps does not work
       * — the columns of backs abut as closely as the rows do — but the block
       * of ink divided by the class's own card width does, and lands on a
       * whole number every time. */
      const across = Math.max(1, Math.round(found.box.w / shape.width));
      const width = found.box.w / across;
      classPages.set(found.spellClass, {
        page: page.page,
        backPage,
        left: found.box.x,
        top: found.box.y,
        width,
        height: width * (shape.height / shape.width)
      });
    }
  }
  return classPages;
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
  const found = [], backSheets = [];
  let grid = null, read = 0, pageWidth = 0;

  for (let start = 1; start <= doc.numPages; start += PAGES_AT_ONCE) {
    const batch = [];
    for (let n = start; n < start + PAGES_AT_ONCE && n <= doc.numPages; n++) batch.push(n);

    const results = await Promise.all(batch.map(async (n) => {
      const page = await doc.getPage(n);
      const view = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const read = readPage(content.items, view.width, view.height);
      // A page with no cards on it is a sheet of backs, and those are what say
      // what size the cards are. Only measured when the caller wants classes,
      // since it means rendering the page.
      /* A page with no card text is a sheet of backs, and those are what show
       * the card size. Measured with two strips rather than over the whole
       * page: crop marks are printed at the margins of every sheet, so a
       * whole-page measurement finds the marks and every layout looks alike. */
      let box = null;
      if (classes && !read.cards.length) {
        const rows = await deckPdf.rowBandsAt(page, view.width / 144 - 0.3, 0.6);
        if (rows.length) {
          const middle = rows[0].y + rows[0].h / 2;
          const cols = await deckPdf.colBandsAt(page, middle - 0.3, 0.6);
          if (cols.length) {
            box = { x: cols[0].x, y: rows[0].y,
                    w: cols[cols.length - 1].x + cols[cols.length - 1].w - cols[0].x,
                    h: rows[rows.length - 1].y + rows[rows.length - 1].h - rows[0].y,
                    columns: cols.length, rows: rows.length };
          }
        }
      }
      return { page: n, width: view.width / 72, box, ...read };
    }));

    for (const result of results) {
      if (result.cards.length) {
        found.push(result);
        grid ??= result.grid;
        pageWidth ||= result.width;
      } else if (result.box) {
        backSheets.push({ page: result.page, box: result.box });
      }
    }
    read += batch.length;
    onProgress?.({ done: read, total: doc.numPages,
                  found: found.reduce((n, p) => n + p.cards.length, 0) });
  }

  // Printed order is the order the classes run in, so sort before classifying.
  found.sort((a, b) => a.page - b.page);
  backSheets.sort((a, b) => a.page - b.page);
  const classPages = classes ? await assignClasses(found, backSheets) : null;

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
    grid, sheets: found.length, classPages
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

/**
 * The item an incantation becomes.
 *
 * Incantation cards and spell cards are the same card — the decks print them
 * identically, which is why a deck that mixes the two cannot be split on the
 * card face at all. So they are read by the same code and differ only here.
 *
 * `categories` is not written at all — which is different from writing it
 * empty, and the difference costs real work. A Foundry update merges rather
 * than replaces, so a field left out of the payload keeps whatever is already
 * there, while a field set to [] wipes it. Writing an empty array cleared the
 * categories on 208 entries that had them.
 *
 * A vislae who has not held a specific
 * incantation before "can ask for a general type of conation incantation...
 * rather than a specific one" (The Way, p106) — but the cards print no such
 * type, and it cannot be had by matching keywords against a description:
 * "The Decay of Neglect" rots a foe's armour and never says damage, while
 * "Only Footsteps Come This Way" raises a barrier and never says defend. A
 * category that is wrong is worse than none, because the player asks for a
 * type and is handed something unrelated. So nothing is invented here.
 */
export function toIncantationItem(spell, img) {
  return {
    name: spell.name,
    type: "Incantation",
    img: img || "icons/magic/symbols/rune-sigil-horned-blue.webp",
    system: {
      level: parseInt(spell.level, 10) || 1,
      color: spell.color || "",
      depletion: spell.depletion || "",
      description: spell.description ? `<p>${spell.description}</p>` : "",
      dice: spell.dice || "",
      facets: spell.facets || "",
      note: spell.note ? `<p>${spell.note}</p>` : ""
      // categories: deliberately absent — see above.
    }
  };
}
