/**
 * Invisible Sun — reading the objects of power and ephemera decks.
 *
 * These cards share the spell decks' layout and are read with the same
 * column-finding code, so nothing here renders a page either. What they add is
 * a Form — the physical thing the magic lives in — a category banner above the
 * name, two depletions where the object produces an ongoing effect, and a
 * citation of the book the object is written up in.
 */
import { findColumns, columnLines, joinName, NAME_RE, NOISE_RE } from "./spells.mjs";

/** An object that produces an ongoing effect tracks that effect separately, so
 *  it prints two depletions and labels the effect's colour "Effect". */
const FIELD_RE = /^(Object Depletion|Effect Depletion|Depletion|Level|Form|Colou?r|Effect)\s*:\s*(.*)$/;

/** Labels holding a single word. Whatever follows one is the closing note. */
const SINGLE_LINE = new Set(["color", "colour", "effect"]);

/** Banners printed above a name to say what kind of object it is. */
const BANNERS = new Set(["ARTIFACT", "RELIC", "KINDLED", "INSTALLATION"]);

/** The trailing citation: a book title, then "<topic>, page <n>". */
const BOOKS = new Set(["THE PATH", "THE WAY", "THE KEY", "THE GATE", "BOOK M"]);
const PAGE_RE = /^(.*),\s*page\s*(\d+)$/i;

/** A Form that breaks mid-phrase: whatever follows belongs to it however it is
 *  capitalised. */
const INCOMPLETE_RE = /(,|\b(?:of|and|or|with|in|on|for|the|a|an))$/i;

const LEVEL_RE = /^\s*(\d+)\s*(?:\((.*)\))?\s*$/;

/** How much further right than the label margin counts as an indent. */
const INDENT_INCHES = 0.05;

const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim();

const titleCase = (s) => s.toLowerCase()
  .replace(/(^|[\s\-])([a-z])/g, (m, a, b) => a + b.toUpperCase());

/** The book title is set in caps above the page line; read it back as prose. */
function formatReference(parts) {
  if (!parts.length) return "";
  const rest = [...parts];
  if (BOOKS.has(rest[0])) return `${titleCase(rest.shift())}, ${rest.join(" ")}`.trim();
  return rest.join(" ").trim();
}

/**
 * Read one card.
 *
 * The Form runs to several lines and the description follows it with nothing
 * between them, so the two can only be told apart by where they sit: the card
 * sets every label and the description's first line against the same margin,
 * and indents anything continuing a label.
 */
function parseCard(nameParts, lines, lefts) {
  const parts = [...nameParts];
  let kind = "";
  while (parts.length && BANNERS.has(parts[0])) kind = parts.shift();
  // A citation's book title is all-caps too, so it joins the following name.
  while (parts.length && BOOKS.has(parts[0])) parts.shift();
  if (!parts.length) return null;

  const body = lines.map((text, i) => ({ text: text.trim(), left: lefts[i] }))
    .filter(l => l.text && !NOISE_RE.test(l.text));

  const labelled = body.filter(l => FIELD_RE.test(l.text));
  if (!labelled.length) return null;
  const margin = Math.min(...labelled.map(l => l.left));

  const description = [], fields = {}, reference = [];
  let current = null;

  for (const line of body) {
    const match = line.text.match(FIELD_RE);
    if (match) {
      current = match[1].toLowerCase();
      fields[current] = match[2].trim();
      continue;
    }
    if (BOOKS.has(line.text) || PAGE_RE.test(line.text)) {
      reference.push(line.text);
      current = "ref";
      continue;
    }

    if (current === "note") {
      /* The closing aside is the last thing on a card, so once it starts
       * nothing after it belongs anywhere else. That matters because it is set
       * centred rather than flush left: its lines wander by a tenth of an inch
       * either way, and one of them lands exactly on the label margin. Read as
       * flush left, that line and everything after it fall back into the
       * description. */
    } else if (line.left <= margin + INDENT_INCHES) {
      current = null;                       // flush left: a new block
    } else if (SINGLE_LINE.has(current)) {
      current = "note";
      fields.note ??= "";
    } else if (current === "form" && /^[A-Z]/.test(line.text)
      && !INCOMPLETE_RE.test(fields.form)) {
      /* One card indents the first line of its description, so indentation
       * alone would fold it into the Form. A capital starts the description
       * unless the Form is plainly unfinished — "Icon of Diamelu," wraps onto
       * "Goddess of Thieves". */
      current = null;
    }

    if (current === "ref") reference.push(line.text);
    else if (current) fields[current] = `${fields[current]} ${line.text}`.trim();
    else description.push(line.text);
  }

  if (!("level" in fields) || !("form" in fields)) return null;

  const level = (fields.level ?? "").match(LEVEL_RE);
  return {
    name: joinName(parts),
    kind: titleCase(kind),
    level: level ? level[1] : clean(fields.level),
    dice: level && level[2] ? clean(level[2]) : "",
    form: clean(fields.form),
    description: clean(description.join(" ")),
    depletion: clean(fields["object depletion"] ?? fields.depletion),
    effectDepletion: clean(fields["effect depletion"]),
    color: titleCase(clean(fields.color ?? fields.colour ?? fields.effect)),
    reference: clean(formatReference(reference)),
    note: clean(fields.note)
  };
}

/**
 * Split a column into cards.
 *
 * As in the spell decks, but a name may be preceded by a category banner — and
 * a card closes with its citation, whose book title is all-caps and therefore
 * opens the *next* card's name run, taking the page line with it. Both belong
 * to the card that ended, so the slice is extended over them.
 */
function splitCards(lines, lefts) {
  const isName = (l) => NAME_RE.test(l.trim()) && !NOISE_RE.test(l.trim());
  const runs = [];
  for (let i = 0; i < lines.length;) {
    if (!isName(lines[i])) { i++; continue; }
    const start = i;
    const parts = [];
    while (i < lines.length && isName(lines[i])) parts.push(lines[i].trim()), i++;
    runs.push({ start, parts, bodyAt: i });
  }

  const cards = [];
  for (const [n, run] of runs.entries()) {
    let end = lines.length;
    if (n + 1 < runs.length) {
      const next = runs[n + 1];
      let k = 0;
      while (k < next.parts.length && BOOKS.has(next.parts[k])) k++;
      end = next.start + k;
      if (k && end < lines.length && PAGE_RE.test(lines[end].trim())) end++;
    }
    const card = parseCard(run.parts, lines.slice(run.bodyAt, end), lefts.slice(run.bodyAt, end));
    if (card) cards.push(card);
  }
  return cards;
}

/** Every card on one page. */
export function readPage(items, width, height) {
  const grid = findColumns(items, width, height);
  if (!grid) return { cards: [], grid: null };
  const cards = grid.columns.flatMap((column) => {
    const { text, lefts } = columnLines(items, height, column, grid.usable);
    return splitCards(text, lefts);
  });
  return { cards, grid };
}

/** Read a whole deck. */
export async function readDeck(doc, { onProgress } = {}) {
  const PAGES_AT_ONCE = 6;
  const best = new Map();
  let grid = null, sheets = 0, read = 0;

  for (let start = 1; start <= doc.numPages; start += PAGES_AT_ONCE) {
    const batch = [];
    for (let n = start; n < start + PAGES_AT_ONCE && n <= doc.numPages; n++) batch.push(n);

    const results = await Promise.all(batch.map(async (n) => {
      const page = await doc.getPage(n);
      const view = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      return { page: n, ...readPage(content.items, view.width, view.height) };
    }));

    for (const result of results) {
      if (!result.cards.length) continue;
      sheets++;
      grid ??= result.grid;
      // A card cut by a column boundary appears twice; the fuller copy wins.
      for (const card of result.cards) {
        const key = card.name.toUpperCase();
        const previous = best.get(key);
        if (!previous || card.description.length > previous.description.length) best.set(key, card);
      }
    }
    read += batch.length;
    onProgress?.({ done: read, total: doc.numPages, found: best.size });
  }

  return {
    cards: [...best.values()].sort((a, b) => a.name.localeCompare(b.name)),
    grid, sheets
  };
}

/** The item an object becomes. */
export function toItem(object, img) {
  return {
    name: object.name,
    type: "ObjectOfPower",
    img: img || "icons/commodities/treasure/token-gold-gem-red.webp",
    system: {
      level: parseInt(object.level, 10) || 1,
      description: object.description ? `<p>${object.description}</p>` : "",
      depletion: object.depletion === "—" ? "" : (object.depletion || ""),
      objectType: (object.kind || "object").toLowerCase(),
      form: object.form || "",
      color: object.color || "",
      dice: object.dice || "",
      note: object.note ? `<p>${object.note}</p>` : "",
      effectDepletion: object.effectDepletion || "",
      reference: object.reference || ""
    }
  };
}

/**
 * The item an ephemera becomes.
 *
 * Ephemera are typed conflux, charm, cypher or oddity, and the cards do not
 * print which — so the type is not written at all. On a new entry the schema
 * default stands; on one that already exists, whatever is there is left alone.
 *
 * That distinction matters more than it looks. A Foundry update merges rather
 * than replaces, so a field left out keeps its value while a field set to a
 * default overwrites one. Re-importing should never undo a reading someone has
 * made by hand for something the cards do not print.
 */
export function toEphemeraItem(object, img) {
  return {
    name: object.name,
    type: "Ephemera",
    img: img || "icons/commodities/materials/bowl-liquid-white.webp",
    system: {
      level: parseInt(object.level, 10) || 1,
      description: object.description ? `<p>${object.description}</p>` : "",
      depletion: object.depletion === "—" ? "" : (object.depletion || ""),
      form: object.form || "",
      color: object.color || "",
      dice: object.dice || "",
      note: object.note ? `<p>${object.note}</p>` : ""
      // ephemeraType: deliberately absent — see above.
    }
  };
}
