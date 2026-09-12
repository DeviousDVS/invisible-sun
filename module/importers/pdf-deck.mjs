/**
 * Invisible Sun — reading a self-print deck PDF inside Foundry.
 *
 * Monte Cook Games ships a print-your-own PDF with every deck: card faces laid
 * out on sheets with white gutters, backs on the facing page. This takes those
 * sheets apart, in the browser, with no tooling installed.
 *
 * Foundry already bundles pdf.js — it uses it for PDF journal pages — and
 * serves it at /scripts/pdfjs/. So the whole job is available to a system
 * without adding a dependency: pdf.js reads the text layer and renders pages
 * to a canvas, and FilePicker writes the results into the user's data folder.
 *
 * ── Why render and crop rather than pull the embedded images ──
 * The embedded images are the art only. A card's name, value and suns are
 * vector text drawn on top, so the images come out with no writing on them.
 * Rendering the page and cutting out the card's rectangle gives the card as
 * printed.
 *
 * ── Why the grid is measured rather than written down ──
 * Every deck lays out differently, and MCG has reissued these PDFs before. So
 * the grid is found by looking at the page: the sheets are white, the cards are
 * not, and a card is a block of non-white with white all around it. A table of
 * coordinates would be one reissue away from silently cutting every card in
 * half.
 *
 * This module knows nothing about any particular deck. What the cards *say* is
 * the deck's own business — see sooth.mjs.
 */

/** Anything below this is card rather than sheet. */
const INK = 200;

/** Resolution the page is measured at. Fine enough to find the gutters; the
 *  cards themselves are rendered separately at the output size. */
const DETECT_DPI = 100;

/** A block of ink thinner than this is furniture, not a card — every sheet
 *  carries a copyright line along the bottom. */
const MIN_CARD_INCHES = 1.0;

/**
 * How much white separates two things before they count as separate things.
 *
 * This number has to sit between two real measurements on the sheet, and it is
 * worth writing down which: the gutter between two rows of cards is about 0.26
 * inches, and the space between the bottom row and the copyright line is about
 * 0.13. Both must split. Anything smaller than the tightest of those, and with
 * room to spare, is correct — 0.08 sits comfortably under both.
 *
 * Getting this wrong is not loud. Too large by a hair and the bottom row of
 * cards merges with the copyright line into one block the width of the page,
 * which is then not card-shaped, so it is discarded and half the deck simply
 * goes missing. The name check at the end is what catches that.
 */
const GUTTER_INCHES = 0.08;

/** Two cards are the same size if they agree to within this. Anti-aliasing
 *  moves an edge by a pixel; a misdetected grid moves it by hundreds. */
const SIZE_TOLERANCE_PX = 6;

/**
 * How much of a strip must be inked before it counts as card rather than rule.
 *
 * These sheets are printed with hairline trim rules along the card edges, and
 * to a test that asks "is there any ink here?" a hairline and a card look
 * identical. They are not: measured across a strip six tenths of an inch deep,
 * a card's edge inks every row and a trim rule inks two or three per cent of
 * them. Asking for coverage rather than presence tells them apart, and it is
 * the difference between cropping the card and cropping a quarter inch of
 * white paper beside it.
 *
 * Half is a wide margin either way — nothing observed lands between 3% and
 * 100% — and it is the right side of cautious: a rule mistaken for a card
 * shifts every picture, a card mistaken for a rule fails loudly.
 */
const STRIP_COVERAGE = 0.5;

let pdfjs = null;

/** Load Foundry's own copy of pdf.js. */
export async function loadPdfJs() {
  if (pdfjs) return pdfjs;
  pdfjs = await import("/scripts/pdfjs/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/scripts/pdfjs/build/pdf.worker.mjs";
  return pdfjs;
}

/**
 * Open a PDF from a File the user chose, or from a URL.
 *
 * A File is read straight into memory and never written anywhere. That is the
 * point: the books stay where the reader put them, and Foundry's data folder
 * never holds a copy of somebody else's PDF.
 */
export async function openPdf(source) {
  const lib = await loadPdfJs();
  const args = source instanceof Blob
    ? { data: new Uint8Array(await source.arrayBuffer()) }
    : { url: source };
  return lib.getDocument(args).promise;
}

/**
 * The small squares a page draws, in the same coordinates as `pageWords`.
 *
 * Teratology, The Path and The Nightside print a creature's Injuries, Wounds
 * and Anguish as rows of empty tick boxes, and the boxes are drawn rather than
 * typed: the text layer has the labels and nothing at all after them. How many
 * there are is the number, so it has to be counted off the page itself.
 *
 * Walking the operator list is the only way to reach them. A rectangle arrives
 * inside a `constructPath`, whose arguments are its own little op list and a
 * flat run of numbers, and it is in the coordinates in force when it was
 * issued — so the transform stack has to be kept as well, or every box on a
 * page that used one lands somewhere else entirely.
 *
 * Only squares, and only small ones. The same pages draw a column rule, a
 * drop-cap panel and a full-page background, and none of those is 8.6 points
 * on a side.
 */
export async function pageBoxes(page, { min = 5, max = 14 } = {}) {
  const lib = await loadPdfJs();
  const ops = await page.getOperatorList();
  const { height } = page.getViewport({ scale: 1 });
  const name = Object.fromEntries(Object.entries(lib.OPS).map(([k, v]) => [v, k]));

  /* How many numbers each path operator takes, so the run can be walked
   * without knowing what any of them mean. */
  const ARGS = { rectangle: 4, moveTo: 2, lineTo: 2, curveTo: 6, curveTo2: 4, curveTo3: 4 };

  const boxes = [];
  const stack = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const times = (a, b) => [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]
  ];

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = name[ops.fnArray[i]];
    const args = ops.argsArray[i];
    if (fn === "save") stack.push(ctm);
    else if (fn === "restore") ctm = stack.pop() ?? ctm;
    else if (fn === "transform") ctm = times(ctm, args);
    else if (fn === "constructPath") {
      const [subOps, numbers] = args;
      let at = 0;
      for (const sub of subOps) {
        const subName = name[sub];
        if (subName === "rectangle") {
          const [x, y, w, h] = numbers.slice(at, at + 4);
          const width = Math.abs(ctm[0] * w);
          const boxHeight = Math.abs(ctm[3] * h);
          if (Math.abs(width - boxHeight) <= 1 && width >= min && width <= max) {
            boxes.push({
              x: ctm[0] * x + ctm[2] * y + ctm[4],
              // Top-down, to match pageWords — everything downstream sorts that way.
              y: height - (ctm[1] * x + ctm[3] * y + ctm[5]),
              w: width, h: boxHeight
            });
          }
        }
        at += ARGS[subName] ?? 0;
      }
    }
  }
  return boxes;
}

/** Render a whole page to an offscreen canvas at the given resolution. */
export async function renderPage(page, dpi) {
  const viewport = page.getViewport({ scale: dpi / 72 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: canvas.getContext("2d", { willReadFrequently: true }), viewport }).promise;
  return canvas;
}

/** Group a sorted list of positions into contiguous runs. */
function runs(positions, gap) {
  if (!positions.length) return [];
  const out = [];
  let start = positions[0], previous = positions[0];
  for (const value of positions.slice(1)) {
    if (value - previous > gap) { out.push([start, previous]); start = value; }
    previous = value;
  }
  out.push([start, previous]);
  return out;
}

/**
 * Find every block of ink on a page, in reading order — across the sheet
 * before down it, which is the order a deck's cards are numbered in.
 *
 * Blocks are not necessarily cards. The front matter of these PDFs carries
 * printing instructions and a credits page, and those come back as blocks too;
 * deciding which are cards needs the whole document, so the caller does it.
 *
 * Coordinates come back in inches, so they survive a change of resolution.
 */
export async function detectBlocks(page) {
  const canvas = await renderPage(page, DETECT_DPI);
  const { width, height } = canvas;
  const data = canvas.getContext("2d").getImageData(0, 0, width, height).data;

  // One byte per pixel: the red channel is enough on a greyscale-ish scan, and
  // walking a quarter of the buffer is worth the copy.
  const grey = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) grey[p] = data[i];

  const gutter = Math.round(GUTTER_INCHES * DETECT_DPI);
  const floor = Math.round(MIN_CARD_INCHES * DETECT_DPI);

  const rowHasInk = (y, left, right) => {
    const base = y * width;
    for (let x = left; x <= right; x++) if (grey[base + x] < INK) return true;
    return false;
  };
  const colHasInk = (x, top, bottom) => {
    for (let y = top; y <= bottom; y++) if (grey[y * width + x] < INK) return true;
    return false;
  };

  const inkedRows = [];
  for (let y = 0; y < height; y++) if (rowHasInk(y, 0, width - 1)) inkedRows.push(y);
  const bands = runs(inkedRows, gutter).filter(([a, b]) => b - a + 1 >= floor);

  const blocks = [];
  for (const [top, bottom] of bands) {
    const inkedCols = [];
    for (let x = 0; x < width; x++) if (colHasInk(x, top, bottom)) inkedCols.push(x);
    const columns = runs(inkedCols, gutter).filter(([a, b]) => b - a + 1 >= floor);
    for (const [left, right] of columns) {
      // A band is as tall as its tallest block, so re-measure this one within
      // its own column — otherwise the bottom row reaches into the copyright
      // line that runs under it.
      const own = [];
      for (let y = top; y <= bottom; y++) if (rowHasInk(y, left, right)) own.push(y);
      const mine = runs(own, gutter).filter(([a, b]) => b - a + 1 >= floor);
      if (mine.length !== 1) continue;
      const [y0, y1] = mine[0];
      blocks.push({
        x: left / DETECT_DPI, y: y0 / DETECT_DPI,
        w: (right - left + 1) / DETECT_DPI, h: (y1 - y0 + 1) / DETECT_DPI
      });
    }
  }
  return blocks;
}

/**
 * Every word on a page, as { x, y, text } in inches from the top left.
 *
 * pdf.js measures from the bottom left, the way PDF itself does, and every
 * other measurement here is from the top. Flipping once, here, keeps that
 * disagreement in one place instead of at each use.
 */
export async function pageWords(page) {
  const content = await page.getTextContent();
  const height = page.getViewport({ scale: 1 }).height;
  return content.items
    // Whitespace-only items are dropped, and they are not what they look like.
    // Text set along a curve comes back one glyph at a time with a space item
    // wedged between most of them — "G", " ", "r", " ", "e", "y" — so trusting
    // them spells the card's own name as "G r ey". The real word breaks are
    // wide gaps between glyphs, which readLine finds; these are noise.
    .filter(item => item.str.trim() !== "")
    .map(item => ({
      x: item.transform[4] / 72,
      y: (height - item.transform[5]) / 72,
      w: item.width / 72,
      // Trimmed for the same reason. Some glyphs arrive with a space attached —
      // "p " in the middle of "Companion" — and stitching those together
      // spells "Comp anion", which matches no rank and no sun. Word breaks are
      // decided by the gaps between glyphs, never by whitespace inside one.
      text: item.str.trim()
    }));
}

const inside = (box, word) =>
  word.x >= box.x && word.x <= box.x + box.w && word.y >= box.y && word.y <= box.y + box.h;

/** The words inside a block, in reading order. */
export const wordsIn = (box, words) => words.filter(w => inside(box, w));

/**
 * Read one line of a card, reassembled left to right.
 *
 * Card faces set their text along a curve, so pdf.js hands back the letters
 * one at a time at varying heights — "C", "o", "m", "p" — and sorting by
 * anything but x scrambles them. A gap wider than `gap` inches is a real word
 * break rather than the curve separating two letters.
 */
export function readLine(box, words, from, to, gap = 1.5 / 72) {
  const band = words
    .filter(w => inside(box, w) && w.y >= box.y + box.h * from && w.y < box.y + box.h * to)
    .sort((a, b) => a.x - b.x);

  let out = "", previousEnd = null;
  for (const word of band) {
    if (previousEnd !== null && word.x - previousEnd > gap) out += " ";
    out += word.text;
    previousEnd = word.x + word.w;
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * How many sheets are measured before the grid is taken as settled.
 *
 * Every sheet in a deck is laid out by the same template, so measuring all of
 * them is repeating one measurement thirty times — and measuring means
 * rendering, which is most of the time an import takes. A handful is enough to
 * establish the grid *and* to notice if it is not consistent, which is the
 * part that matters: the sample has to be able to disagree with itself.
 */
const SAMPLE_SHEETS = 4;

/** Two boxes describe the same slot if they agree to within this. */
const SAME_BOX_INCHES = SIZE_TOLERANCE_PX / DETECT_DPI;

const sameBox = (a, b) =>
  Math.abs(a.x - b.x) <= SAME_BOX_INCHES && Math.abs(a.y - b.y) <= SAME_BOX_INCHES
  && Math.abs(a.w - b.w) <= SAME_BOX_INCHES && Math.abs(a.h - b.h) <= SAME_BOX_INCHES;

const boxHoldsWords = (box, words) => words.some(w => inside(box, w));

/**
 * Work out which blocks are cards, and which of those are faces.
 *
 * Three things have to be told apart, and each is a rule rather than a special
 * case:
 *
 *  - **Cards from furniture.** A deck is mostly cards and every card is the
 *    same size, so the size that turns up most often is the card. Deciding
 *    this across several sheets rather than one is what lets the front matter
 *    be discarded: the printing instructions sit beside a sample card back
 *    that is exactly card-sized.
 *  - **Faces from backs.** A face is printed with its name and value; a back
 *    carries art alone. So the test is text *inside the block* — not anywhere
 *    on the page, because every sheet has a copyright line and the front
 *    matter has whole paragraphs beside a sample card.
 *  - **Print sheets from front matter.** The credits are printed on a card. It
 *    is card-shaped, card-sized, and has writing on it, so every test above
 *    says it is a face. What gives it away is sitting alone: a print sheet
 *    carries a full grid.
 *
 * ── Why only a few sheets are measured ──
 * Measuring a page means rendering it, and rendering a page of this kind means
 * decoding the four full-size photographs printed on it. That is the bulk of
 * an import. But the sheets are all struck from one template, so the grid
 * found on one holds for the rest — and once it is known, every other page can
 * be classified from its text layer alone, which costs nothing to read.
 *
 * The sample is required to agree with itself. If it does not, this is a deck
 * laid out in some way that has not been seen, and it falls back to measuring
 * every page rather than pressing on with a grid it has reason to doubt.
 */
export async function readSheets(doc, { onProgress } = {}) {
  const pages = [...Array(doc.numPages).keys()].map(n => n + 1);

  /* The text layer for the whole document — no rendering, and it is what every
   * page is classified by once the grid is known.
   *
   * Read several pages at a time. "No rendering" is not the same as free:
   * pdf.js still has to parse each page's content stream and resolve its
   * fonts, and across thirty-odd sheets that was costing more than measuring
   * the sample did. The pages are independent, so there is no reason to wait
   * for each one. */
  const PAGES_AT_ONCE = 6;
  const words = new Map();
  let read = 0;

  for (let start = 0; start < pages.length; start += PAGES_AT_ONCE) {
    const batch = pages.slice(start, start + PAGES_AT_ONCE);
    const got = await Promise.all(batch.map(async (n) => [n, await pageWords(await doc.getPage(n))]));
    for (const [n, list] of got) words.set(n, list);
    read += batch.length;
    onProgress?.({ stage: "text", done: read, total: doc.numPages });
  }

  /* Sheets are sampled by how much text they carry. A face sheet holds four
   * cards' worth of names and numbers; front matter and back sheets hold
   * little or none. So the busiest pages are the likeliest full sheets, which
   * is what the grid needs to be measured from. */
  const busiest = [...pages].sort((a, b) => words.get(b).length - words.get(a).length);
  const sample = [...new Set(busiest.slice(0, SAMPLE_SHEETS))].sort((a, b) => a - b);

  const measured = new Map();
  let done = 0;
  for (const n of sample) {
    measured.set(n, await detectBlocks(await doc.getPage(n)));
    onProgress?.({ stage: "scan", done: ++done, total: sample.length });
  }

  const grid = agreedGrid(measured);
  const scan = grid
    ? classifyByText(grid, words, pages)
    : await measureEveryPage(doc, words, pages, onProgress);

  if (!scan.faces.length) throw new Error("No card faces found — is this a self-print deck PDF?");
  return scan;
}

/**
 * The grid the sampled sheets agree on, or null if they do not.
 *
 * Agreement means: the same number of card-sized blocks, in the same places.
 * A single sheet agreeing with itself proves nothing, so at least two have to
 * say the same thing before the rest of the document is classified from it.
 */
function agreedGrid(measured) {
  const tally = new Map();
  for (const blocks of measured.values()) {
    for (const b of blocks) {
      const key = `${b.w.toFixed(1)}x${b.h.toFixed(1)}`;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
  }
  if (!tally.size) return null;

  const [cardKey] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  const [cardW, cardH] = cardKey.split("x").map(Number);
  const card = { w: cardW, h: cardH };
  const isCard = (b) => Math.abs(b.w - cardW) <= SAME_BOX_INCHES
                     && Math.abs(b.h - cardH) <= SAME_BOX_INCHES;

  const layouts = [...measured.values()].map(blocks => blocks.filter(isCard)).filter(l => l.length);
  if (!layouts.length) return null;

  const counts = new Map();
  for (const l of layouts) counts.set(l.length, (counts.get(l.length) ?? 0) + 1);
  const [fullSheet, agreeing] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (agreeing < 2) return null;

  const full = layouts.filter(l => l.length === fullSheet);
  const [reference] = full;
  const consistent = full.every(l => l.every((box, i) => sameBox(box, reference[i])));
  return consistent ? { card, fullSheet, boxes: reference } : null;
}

/** Classify every page against a known grid, using its text alone. */
function classifyByText(grid, words, pages) {
  const { card, fullSheet, boxes } = grid;
  const faces = [], backs = [], frontMatter = [];

  for (const page of pages) {
    const pageWordList = words.get(page);
    const filled = boxes.filter(box => boxHoldsWords(box, pageWordList));

    if (filled.length === fullSheet) {
      for (const box of boxes) faces.push({ page, box, words: pageWordList });
    } else if (filled.length === 0) {
      // Nothing written in any slot. Either a sheet of backs or a page with no
      // cards at all; cutCards will only ever be asked for one of them, and a
      // page with no cards would be a blank, which no deck prints.
      for (const box of boxes) backs.push({ page, box, words: pageWordList });
    } else {
      frontMatter.push(page);
    }
  }
  return { card, fullSheet, frontMatter, faces, backs };
}

/**
 * The original: measure every page. Used when the sample disagrees, which
 * means a layout this has not seen and no business guessing about.
 */
async function measureEveryPage(doc, words, pages, onProgress) {
  const found = [];
  const CONCURRENCY = 4;
  let scanned = 0;

  for (let start = 0; start < pages.length; start += CONCURRENCY) {
    const batch = pages.slice(start, start + CONCURRENCY);
    const results = await Promise.all(batch.map(async (n) => {
      const blocks = await detectBlocks(await doc.getPage(n));
      return blocks.length ? { page: n, blocks } : null;
    }));
    for (const r of results) if (r) found.push(r);
    scanned += batch.length;
    onProgress?.({ stage: "scan", done: scanned, total: pages.length });
  }

  const tally = new Map();
  for (const { blocks } of found) {
    for (const b of blocks) {
      const key = `${b.w.toFixed(1)}x${b.h.toFixed(1)}`;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
  }
  if (!tally.size) throw new Error("No cards found — is this a self-print deck PDF?");
  const [cardKey] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  const [cardW, cardH] = cardKey.split("x").map(Number);
  const isCard = (b) => Math.abs(b.w - cardW) <= SAME_BOX_INCHES
                     && Math.abs(b.h - cardH) <= SAME_BOX_INCHES;

  const faces = [], backs = [];
  for (const { page, blocks } of found) {
    for (const box of blocks) {
      if (!isCard(box)) continue;
      const list = words.get(page);
      (boxHoldsWords(box, list) ? faces : backs).push({ page, box, words: list });
    }
  }

  const perSheet = new Map();
  for (const f of faces) perSheet.set(f.page, (perSheet.get(f.page) ?? 0) + 1);
  const counts = new Map();
  for (const n of perSheet.values()) counts.set(n, (counts.get(n) ?? 0) + 1);
  const fullSheet = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];

  const backsPerSheet = new Map();
  for (const b of backs) backsPerSheet.set(b.page, (backsPerSheet.get(b.page) ?? 0) + 1);

  return {
    card: { w: cardW, h: cardH },
    fullSheet,
    frontMatter: [...perSheet].filter(([, n]) => n !== fullSheet).map(([p]) => p).sort((a, b) => a - b),
    faces: faces.filter(f => perSheet.get(f.page) === fullSheet),
    backs: backs.filter(b => backsPerSheet.get(b.page) === fullSheet)
  };
}

/**
 * Make the sheet showing around a card transparent.
 *
 * The Sooth cards are round, so a square crop of one carries four white
 * corners. On a dark sheet or a dark table they read as a white box with a
 * circle in it.
 *
 * ── Why this is a flood fill and not "white becomes transparent" ──
 * The cards write their own name, value and suns in white. Keying out every
 * white pixel would erase the writing along with the background — the card
 * would come back with its name punched out of it. Only white that is joined
 * to the outside edge is background; white enclosed by the card is the card's.
 * So the fill starts at the border and spreads inward, and stops where the ink
 * does.
 *
 * ── The soft edge ──
 * A hard threshold leaves a stair-stepped rim, because the printed edge is
 * anti-aliased: there is a band of part-white pixels between sheet and card.
 * Those get partial alpha in proportion to how white they are, which is what
 * the renderer meant by drawing them that way.
 */
export function maskBackground(canvas, { white = 232, soft = 60 } = {}) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = image;
  const count = width * height;

  const luminance = new Uint8Array(count);
  for (let i = 0, p = 0; p < count; i += 4, p++) {
    // Rough on purpose: this is deciding "is this the paper", not colour work.
    luminance[p] = (data[i] + data[i + 1] + data[i + 2]) / 3;
  }

  // Flood fill inward from every edge pixel that is paper-coloured. An explicit
  // stack rather than recursion: a 512-square card is a quarter of a million
  // pixels and the call stack would not survive it.
  const outside = new Uint8Array(count);
  const stack = [];
  const consider = (p) => {
    if (!outside[p] && luminance[p] >= white) { outside[p] = 1; stack.push(p); }
  };
  for (let x = 0; x < width; x++) { consider(x); consider((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { consider(y * width); consider(y * width + width - 1); }

  while (stack.length) {
    const p = stack.pop();
    const x = p % width, y = (p - x) / width;
    if (x > 0) consider(p - 1);
    if (x < width - 1) consider(p + 1);
    if (y > 0) consider(p - width);
    if (y < height - 1) consider(p + width);
  }

  for (let p = 0; p < count; p++) {
    if (outside[p]) { data[p * 4 + 3] = 0; continue; }

    // Kept, but if it sits against the background and is nearly as pale, it is
    // part of the printed edge rather than the face — fade it by how pale.
    const x = p % width, y = (p - x) / width;
    const touching =
      (x > 0 && outside[p - 1]) || (x < width - 1 && outside[p + 1]) ||
      (y > 0 && outside[p - width]) || (y < height - 1 && outside[p + width]);
    if (!touching) continue;

    const alpha = Math.round(255 * Math.min(1, (white - luminance[p]) / soft));
    data[p * 4 + 3] = Math.max(0, alpha);
  }

  context.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Encode a canvas, keeping transparency if it has any.
 *
 * JPEG has no alpha channel, so a masked card written as JPEG comes back with
 * its corners white again — the mask silently undone at the last step. WebP
 * carries alpha and is a fraction of PNG's size on artwork like this, so it is
 * preferred; PNG is the fallback for a browser that will not encode WebP,
 * where the cost is file size rather than correctness.
 */
async function encode(canvas, { alpha, quality }) {
  const attempt = (type) => new Promise(resolve => canvas.toBlob(resolve, type, quality));

  if (!alpha) return { blob: await attempt("image/jpeg"), extension: "jpg" };

  const webp = await attempt("image/webp");
  if (webp?.type === "image/webp") return { blob: webp, extension: "webp" };
  return { blob: await attempt("image/png"), extension: "png" };
}

/**
 * Cut cards out, in the order given. Each comes back as { blob, extension }:
 * what a card is encoded as depends on whether its background was masked, and
 * the name it is saved under has to follow.
 *
 * Rendering is the expensive part by a wide margin, so the work is grouped by
 * page: a sheet is drawn once and every card on it is cut from that one
 * drawing. Cutting card by card would render the same sheet four times over.
 *
 * Every card comes out the same size. Detection puts a card's edge within a
 * pixel or two of its neighbours', invisible on the page but enough to leave a
 * UI laying them out side by side with images that disagree about how big a
 * card is. So the crop is the nominal card, centred on where this one was
 * actually found.
 */
export async function cutCards(doc, faces, { card, size = 512, quality = 0.9, mask = false, onProgress } = {}) {
  const dpi = Math.round(size / card.w);
  const width = size;
  const height = Math.round(size * card.h / card.w);

  const byPage = new Map();
  faces.forEach((face, i) => {
    if (!byPage.has(face.page)) byPage.set(face.page, []);
    byPage.get(face.page).push({ face, i });
  });

  const images = new Array(faces.length);
  let done = 0;
  for (const [pageNumber, entries] of byPage) {
    const sheet = await renderPage(await doc.getPage(pageNumber), dpi);
    for (const { face, i } of entries) {
      const crop = document.createElement("canvas");
      crop.width = width;
      crop.height = height;
      crop.getContext("2d", { willReadFrequently: true }).drawImage(
        sheet,
        Math.round((face.box.x + face.box.w / 2) * dpi) - Math.round(width / 2),
        Math.round((face.box.y + face.box.h / 2) * dpi) - Math.round(height / 2),
        width, height, 0, 0, width, height);

      if (mask) maskBackground(crop);
      images[i] = await encode(crop, { alpha: mask, quality });
      onProgress?.({ done: ++done, total: faces.length });
    }
  }
  return images;
}

/**
 * The vertical bands of ink in a narrow strip of a page.
 *
 * Used to find the rows of a deck whose cards abut. Measuring the whole page
 * cannot separate them — the crop marks printed in the gutters bridge every
 * gap, so the sheet reads as one block — but those marks sit at the cards'
 * corners, so a strip taken through the middle of a column meets only card and
 * gutter, and the rows fall out of it.
 */
export async function rowBandsAt(page, x, w) {
  const canvas = await renderPage(page, DETECT_DPI);
  const { width, height } = canvas;
  const data = canvas.getContext("2d").getImageData(0, 0, width, height).data;

  const left = Math.max(0, Math.round(x * DETECT_DPI));
  const right = Math.min(width - 1, Math.round((x + w) * DETECT_DPI));

  const span = right - left + 1;
  const inked = [];
  for (let y = 0; y < height; y++) {
    const base = y * width;
    let hits = 0;
    for (let px = left; px <= right; px++) if (data[(base + px) * 4] < INK) hits++;
    if (hits / span >= STRIP_COVERAGE) inked.push(y);
  }
  const floor = Math.round(MIN_CARD_INCHES * DETECT_DPI);
  return runs(inked, Math.round(GUTTER_INCHES * DETECT_DPI))
    .filter(([a, b]) => b - a + 1 >= floor)
    .map(([a, b]) => ({ y: a / DETECT_DPI, h: (b - a + 1) / DETECT_DPI }));
}

/**
 * The horizontal bands of ink in a shallow strip of a page.
 *
 * The transpose of rowBandsAt, and it exists for the same reason: crop marks.
 * They are printed at the page margins on every sheet, so measuring a whole
 * page finds the marks rather than the cards, and every layout comes back the
 * same size. A strip taken through the middle of a card meets card and gutter
 * only.
 */
export async function colBandsAt(page, y, h) {
  const canvas = await renderPage(page, DETECT_DPI);
  const { width, height } = canvas;
  const data = canvas.getContext("2d").getImageData(0, 0, width, height).data;

  const top = Math.max(0, Math.round(y * DETECT_DPI));
  const bottom = Math.min(height - 1, Math.round((y + h) * DETECT_DPI));

  const span = bottom - top + 1;
  const inked = [];
  for (let x = 0; x < width; x++) {
    let hits = 0;
    for (let py = top; py <= bottom; py++) if (data[(py * width + x) * 4] < INK) hits++;
    if (hits / span >= STRIP_COVERAGE) inked.push(x);
  }
  const floor = Math.round(MIN_CARD_INCHES * DETECT_DPI);
  return runs(inked, Math.round(GUTTER_INCHES * DETECT_DPI))
    .filter(([a, b]) => b - a + 1 >= floor)
    .map(([a, b]) => ({ x: a / DETECT_DPI, w: (b - a + 1) / DETECT_DPI }));
}

/**
 * The lowest block of ink inside a region of a page, bounded tightly.
 *
 * Written for the sigil each order carries above its name in The Key: it sits
 * in the column, between the paragraph above it and the heading below, and
 * nothing in the text layer describes it, so it has to be found by looking.
 *
 * Two passes, and the second is the one that matters. The first sweeps the
 * whole width of the region to find the rows the block occupies, which is
 * enough where the region holds nothing else — but the rule the books print
 * between their columns is ink too, and it runs the length of the page, so in
 * a region wide enough to include it every row is inked and the block never
 * ends. So the width is settled first, by the widest run of inked columns
 * rather than by the leftmost and rightmost, and the rows are then measured
 * again inside that width alone.
 *
 * @param {object} page          a pdf.js page
 * @param {object} region        {left, right, top, bottom} in points
 * @param {number} [gap]         blank points that separate one block from the next
 * @returns {Promise<object|null>} {x, y, w, h} in inches, or null for no ink
 */
export async function lastInkBlock(page, { left, right, top, bottom }, { gap = 5 } = {}) {
  const canvas = await renderPage(page, DETECT_DPI);
  const { width, height } = canvas;
  const data = canvas.getContext("2d").getImageData(0, 0, width, height).data;

  const px = (points) => Math.round(points * DETECT_DPI / 72);
  const x0 = Math.max(0, px(left)), x1 = Math.min(width - 1, px(right));
  const y0 = Math.max(0, px(top)), y1 = Math.min(height - 1, px(bottom));
  const dark = (x, y) => data[((y * width) + x) * 4] < INK;

  /** The last run in `values`, where a break is more than `by` apart. */
  const lastRun = (values, by) => {
    if (!values.length) return null;
    let start = values[0], previous = values[0];
    for (const v of values.slice(1)) {
      if (v - previous > by) start = v;
      previous = v;
    }
    return [start, previous];
  };
  /** The widest such run. */
  const widestRun = (values, by) => {
    if (!values.length) return null;
    const runs = [];
    let start = values[0], previous = values[0];
    for (const v of values.slice(1)) {
      if (v - previous > by) { runs.push([start, previous]); start = v; }
      previous = v;
    }
    runs.push([start, previous]);
    return runs.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a));
  };

  const rows = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) if (dark(x, y)) { rows.push(y); break; }
  }
  const rough = lastRun(rows, px(gap));
  if (!rough) return null;

  const columns = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = rough[0]; y <= rough[1]; y++) if (dark(x, y)) { columns.push(x); break; }
  }
  const [cx0, cx1] = widestRun(columns, px(gap * 1.6));

  const tight = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = cx0; x <= cx1; x++) if (dark(x, y)) { tight.push(y); break; }
  }
  const [cy0, cy1] = lastRun(tight, px(gap));

  return {
    x: cx0 / DETECT_DPI, y: cy0 / DETECT_DPI,
    w: (cx1 - cx0 + 1) / DETECT_DPI, h: (cy1 - cy0 + 1) / DETECT_DPI
  };
}

/**
 * Cut one arbitrary rectangle out of a page.
 *
 * Used for a deck's card back. Those decks are read rather than looked at, so
 * nothing measures their grid in pixels — and it could not anyway, since the
 * cards are printed hard against one another with crop marks bridging what
 * gaps there are. But the back is the same picture on every card in the deck,
 * so one rectangle taken from the middle of a back sheet is the whole of what
 * is needed, and where exactly it falls does not matter as long as it is
 * inside the card.
 */
export async function cutRegion(doc, page, box, { size = 512, quality = 0.9 } = {}) {
  const [image] = await cutCards(doc, [{ page, box }],
    { card: { w: box.w, h: box.h }, size, quality, mask: false });
  return image;
}
