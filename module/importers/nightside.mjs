/**
 * Invisible Sun — reading The Nightside's base cards.
 *
 * Every other deck holds one kind of card. This one holds five: spells,
 * incantations, objects of power, ephemera and Weaver aggregates, shuffled
 * together and printed eight to a sheet, sometimes several kinds to a sheet.
 *
 * ── Why the faces cannot say which is which ──
 * Three of the five are distinguishable by what they print. An aggregate lists
 * QUALITIES and ABSENCES. An object or an ephemera states a Form. But an
 * object and an ephemera print the same fields as each other, and a spell and
 * an incantation are — deliberately — the same card. The old pipeline split
 * the last pair by looking up which book already named each one, which works
 * only for cards somebody has already catalogued.
 *
 * ── What does say which is which ──
 * The back. Each card is backed by its own deck's livery, and those are
 * strongly coloured and quite distinct: the spell decks green, objects violet,
 * ephemera amber, incantations dark red, aggregates a deeper red still. So a
 * card is identified by the colour printed on the other side of it, which is
 * exactly what that colour is for at a table.
 *
 * The reference colours are measured from the decks' own backs rather than
 * guessed. Where the routing can be checked another way it agrees: the fifteen
 * spells and three incantations this finds are the same fifteen and three the
 * book lists give.
 */
import * as spells from "./spells.mjs";
import * as objects from "./objects.mjs";
import * as aggregates from "./aggregates.mjs";
import { rowBandsAt, colBandsAt, renderPage } from "./pdf-deck.mjs";

/**
 * The mean colour of each deck's card back.
 *
 * Measured from the backs cut out of the decks themselves, not chosen. They
 * are far enough apart to tell by eye and by arithmetic — the closest pair,
 * ephemera and incantations, sit about seventeen apart in RGB while a card
 * matches its own livery within eight.
 */
const LIVERY = {
  spell:       [40, 48, 26],
  object:      [38, 31, 57],
  ephemera:    [69, 45, 25],
  incantation: [67, 28, 22],
  aggregate:   [104, 19, 17]
};

/** Resolution the backs are sampled at. Colour needs no detail. */
const SAMPLE_DPI = 60;

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const nearestLivery = (rgb) => Object.entries(LIVERY)
  .map(([type, colour]) => ({ type, gap: distance(rgb, colour) }))
  .sort((a, b) => a.gap - b.gap)[0];

/**
 * The type of every card position on a sheet, read off its backs.
 *
 * The backs abut and crop marks bridge the gutters, so the block of them is
 * found as one and divided by the grid rather than detected card by card.
 */
async function liveryOfSheet(doc, backPage, columns, rows) {
  const page = await doc.getPage(backPage);
  const view = page.getViewport({ scale: 1 });

  const bands = await rowBandsAt(page, view.width / 144 - 0.3, 0.6);
  if (!bands.length) return null;
  const middle = bands[0].y + bands[0].h / 2;
  const across = await colBandsAt(page, middle - 0.3, 0.6);
  if (!across.length) return null;

  const block = {
    x: across[0].x,
    y: bands[0].y,
    w: across[across.length - 1].x + across[across.length - 1].w - across[0].x,
    h: bands[bands.length - 1].y + bands[bands.length - 1].h - bands[0].y
  };
  const cardW = block.w / columns, cardH = block.h / rows;

  const canvas = await renderPage(page, SAMPLE_DPI);
  const context = canvas.getContext("2d", { willReadFrequently: true });

  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      // The middle half of the card, clear of its border and any crop mark.
      const data = context.getImageData(
        Math.round((block.x + column * cardW + cardW * 0.25) * SAMPLE_DPI),
        Math.round((block.y + row * cardH + cardH * 0.25) * SAMPLE_DPI),
        Math.round(cardW * 0.5 * SAMPLE_DPI),
        Math.round(cardH * 0.5 * SAMPLE_DPI)).data;

      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
      cells.push(nearestLivery([Math.round(r / n), Math.round(g / n), Math.round(b / n)]));
    }
  }
  return { cells, columns, rows, block, cardW, cardH };
}

/**
 * Which cell of the sheet a card sits in, from where its text begins.
 *
 * The columns arrive in points because they are measured off the raw text, and
 * a card's own position is in inches like everything else here. Comparing the
 * two without converting puts every card in the first column, which reads as a
 * plausible answer and is wrong for seven cards in eight.
 */
function cellOf(card, columnsInInches, rowTops) {
  const column = columnsInInches.findIndex(c => card.left >= c.x && card.left < c.x + c.w);
  let row = 0;
  for (const [i, top] of rowTops.entries()) if (card.top >= top - 0.5) row = i;
  return { column: Math.max(0, column), row };
}

/**
 * Read the deck, sorting every card into the kind it belongs to.
 *
 * Each page is read three times over, once by each reader that could apply,
 * and the readers disagree usefully: the object reader takes only cards that
 * state a Form, the aggregate reader only those that list qualities, and the
 * spell reader takes anything with a level. What one takes and another does
 * not is itself information.
 */
export async function readDeck(doc, { onProgress } = {}) {
  const groups = { spell: [], incantation: [], object: [], ephemera: [], aggregate: [] };
  /* Where a back of each kind can be cut from, so the items can carry their
   * own deck's livery rather than a generic icon. One is enough per kind: the
   * backs of a kind are identical. */
  const backs = new Map();
  let sheets = 0, unplaced = 0;

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const view = page.getViewport({ scale: 1 });
    const items = (await page.getTextContent()).items;

    const asSpells = spells.readPage(items, view.width, view.height);
    if (!asSpells.cards.length) { onProgress?.({ done: n, total: doc.numPages }); continue; }
    sheets++;

    const asObjects = objects.readPage(items, view.width, view.height);
    const asAggregates = aggregates.readPage(items, view.width, view.height);

    /* Cards are paired between readers by where they sit, not by what they are
     * called. The two disagree about names on purpose: a card headed ARTIFACT
     * or RELIC has that banner stripped by the object reader, because it is
     * the kind of object and not part of its name, while the spell reader —
     * which knows nothing of banners — keeps it. Matching on the name loses
     * exactly those cards, and they are all objects. */
    const columnsInInches = asSpells.grid.columns.map(c => ({ x: c.x / 72, w: c.w / 72 }));

    const positioned = [...asObjects.cards, ...asSpells.cards].filter(c => c.top != null);
    const rowTops = [];
    for (const top of positioned.map(c => c.top).sort((a, b) => a - b)) {
      if (!rowTops.length || top - rowTops[rowTops.length - 1] > 1) rowTops.push(top);
    }

    const livery = await liveryOfSheet(doc, n - 1, columnsInInches.length, rowTops.length);
    if (livery) {
      for (const [i, cell] of livery.cells.entries()) {
        if (backs.has(cell.type)) continue;
        backs.set(cell.type, {
          page: n - 1,
          box: {
            x: livery.block.x + (i % livery.columns) * livery.cardW,
            y: livery.block.y + Math.floor(i / livery.columns) * livery.cardH,
            w: livery.cardW, h: livery.cardH
          }
        });
      }
    }
    /* The back is a mirror of the face.
     *
     * These sheets are printed double-sided on short-edge binding — the PDF's
     * own first page says so — which flips the paper about its short edge, so
     * the leftmost card on the front is backed by the rightmost on the back.
     * Looking the colour up at the same column reads the wrong card's livery,
     * and does it plausibly: every card still gets a type, and on a sheet where
     * all the backs match it is even correct. It shows up only where a sheet
     * mixes kinds, which is exactly where this deck needed reading. */
    const at = (card) => {
      const { column, row } = cellOf(card, columnsInInches, rowTops);
      const mirrored = livery ? livery.columns - 1 - column : 0;
      return livery?.cells[row * livery.columns + mirrored]?.type;
    };

    const aggregateHere = new Set(asAggregates.cards.map(c => c.name.toUpperCase()));
    const formByCell = new Map();
    for (const card of asObjects.cards) {
      const { column, row } = cellOf(card, columnsInInches, rowTops);
      formByCell.set(`${row}:${column}`, card);
    }

    for (const card of asSpells.cards) {
      if (aggregateHere.has(card.name.toUpperCase())) continue;   // taken below

      const { column, row } = cellOf(card, columnsInInches, rowTops);
      const withForm = formByCell.get(`${row}:${column}`);
      let type = at(card);

      /* What a card states outranks the colour behind it. A Form means object
       * or ephemera and nothing else; no Form means it can be neither. */
      if (withForm && type !== "object" && type !== "ephemera") type = "object";
      if (!withForm && (type === "object" || type === "ephemera")) type = "spell";
      if (!type || type === "aggregate") { type = withForm ? "object" : "spell"; unplaced++; }

      groups[type].push(withForm ?? card);
    }

    for (const card of asAggregates.cards) groups.aggregate.push(card);
    onProgress?.({ done: n, total: doc.numPages });
  }

  for (const list of Object.values(groups)) list.sort((a, b) => a.name.localeCompare(b.name));
  return { groups, sheets, unplaced, backs };
}
