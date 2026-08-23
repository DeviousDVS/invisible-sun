/**
 * Invisible Sun — reading the Weaver aggregates deck.
 *
 * An aggregate is a Weaver's raw material: a thing in the world with qualities
 * to draw on and absences where it is lacking. Its card is laid out unlike the
 * others — no level, no colour, no depletion — but it is still four cards
 * across a sheet, so the column finding is shared. What marks a card's left
 * margin here is its default duration rather than its level.
 */
import { findColumns, columnLines, joinName, NAME_RE, NOISE_RE } from "./spells.mjs";

/** The two lists a card ends with, each under its own heading. */
const QUALITIES = "QUALITIES";
const ABSENCES = "ABSENCES";

const DURATION_RE = /^Default Duration:\s*(.+)$/;
const RANGE_RE = /^Default Range:\s*(.+)$/;

const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim();

/**
 * Read one card.
 *
 * It runs: name, a paragraph of description, the two defaults, then the
 * qualities and the absences under their headings. The headings are what
 * separate the lists — nothing else distinguishes a quality from an absence,
 * since both are printed as a bare word on its own line.
 */
function parseCard(nameParts, lines) {
  const name = joinName(nameParts);
  const description = [], qualities = [], absences = [];
  let duration = "", range = "", section = "description";

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || NOISE_RE.test(line) || /Monte Cook Games|intentionally blank/.test(line)) continue;

    if (line === QUALITIES) { section = "qualities"; continue; }
    if (line === ABSENCES) { section = "absences"; continue; }

    const gotDuration = line.match(DURATION_RE);
    if (gotDuration) { duration = gotDuration[1].trim(); continue; }
    const gotRange = line.match(RANGE_RE);
    if (gotRange) { range = gotRange[1].trim(); continue; }

    if (section === "qualities") qualities.push(line);
    else if (section === "absences") absences.push(line);
    else description.push(line);
  }

  /* A card with neither list is not a card. The sheets carry a blank page and
   * a run of backs, and a stray heading or a caught footer would otherwise
   * come through as an aggregate with a name and nothing in it. */
  if (!qualities.length && !absences.length) return null;

  return {
    name,
    description: clean(description.join(" ")),
    defaultDuration: duration,
    defaultRange: range,
    qualities,
    absences
  };
}

/** Split a column into cards, each beginning with its name in capitals. */
function splitCards(lines) {
  const isName = (l) => NAME_RE.test(l.trim()) && !NOISE_RE.test(l.trim())
    && l.trim() !== QUALITIES && l.trim() !== ABSENCES;

  const starts = [];
  for (const [i, line] of lines.entries()) if (isName(line)) starts.push(i);

  const cards = [];
  for (const [n, start] of starts.entries()) {
    const end = n + 1 < starts.length ? starts[n + 1] : lines.length;
    const card = parseCard([lines[start].trim()], lines.slice(start + 1, end));
    if (card) cards.push(card);
  }
  return cards;
}

/** Every card on one page. */
export function readPage(items, width, height) {
  const grid = findColumns(items, width, height);
  if (!grid) return { cards: [], grid: null };
  const cards = grid.columns.flatMap((column) =>
    splitCards(columnLines(items, height, column, grid.usable).text));
  return { cards, grid };
}

/** Read the whole deck. */
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
      // A card split by a column boundary appears twice; the fuller copy wins.
      for (const card of result.cards) {
        const key = card.name.toUpperCase();
        const previous = best.get(key);
        const size = (c) => c.qualities.length + c.absences.length;
        if (!previous || size(card) > size(previous)) best.set(key, card);
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

/** The item an aggregate becomes. */
export function toItem(aggregate, img) {
  return {
    name: aggregate.name,
    type: "Thread",
    img: img || "icons/svg/net.svg",
    system: {
      description: aggregate.description ? `<p>${aggregate.description}</p>` : "",
      defaultDuration: aggregate.defaultDuration || "",
      defaultRange: aggregate.defaultRange || "",
      qualities: aggregate.qualities ?? [],
      absences: aggregate.absences ?? []
    }
  };
}
