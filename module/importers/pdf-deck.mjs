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

/** Render a whole page to an offscreen canvas at the given resolution. */
async function renderPage(page, dpi) {
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
 * Work out which blocks are cards, and which of those are faces.
 *
 * Three things have to be told apart, and each is a rule rather than a special
 * case:
 *
 *  - **Cards from furniture.** A deck is mostly cards and every card is the
 *    same size, so the size that turns up most often across the whole document
 *    is the card. Deciding this per page could not work: the front matter's
 *    printing instructions sit beside a sample card back that is exactly
 *    card-sized.
 *  - **Faces from backs.** A face is printed with its name and value; a back
 *    carries art alone. So the test is text *inside the block* — not anywhere
 *    on the page, because every sheet has a copyright line and the front matter
 *    has whole paragraphs beside a sample card.
 *  - **Print sheets from front matter.** The credits are printed on a card. It
 *    is card-shaped, card-sized, and has writing on it, so every test above
 *    says it is a face. What gives it away is sitting alone: a print sheet
 *    carries a full grid.
 */
export async function readSheets(doc, { onProgress } = {}) {
  /* Scanned a few pages at a time rather than one after another. Measuring a
   * page means rendering it, and rendering means decoding the four full-size
   * photographs printed on it — which is nearly all of the time this takes. A
   * deck runs to thirty-odd sheets, so doing them strictly in turn leaves the
   * machine idle waiting on each decode. Four at once is a deliberate ceiling:
   * every page in flight holds a full-page canvas and its decoded images, and
   * a whole deck at once would ask for far more memory than it saves time. */
  const CONCURRENCY = 4;
  const found = [];
  let scanned = 0;

  for (let start = 1; start <= doc.numPages; start += CONCURRENCY) {
    const batch = [];
    for (let n = start; n < start + CONCURRENCY && n <= doc.numPages; n++) batch.push(n);

    const results = await Promise.all(batch.map(async (n) => {
      const page = await doc.getPage(n);
      const blocks = await detectBlocks(page);
      return blocks.length ? { page: n, blocks, words: await pageWords(page) } : null;
    }));

    for (const result of results) if (result) found.push(result);
    scanned += batch.length;
    onProgress?.({ stage: "scan", done: scanned, total: doc.numPages });
  }

  // Promise.all preserves order within a batch, and batches run in order, so
  // `found` is already in page order — which is the order the cards are
  // numbered in, and the order everything downstream depends on.

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

  const isCard = (b) =>
    Math.abs(b.w - cardW) * DETECT_DPI <= SIZE_TOLERANCE_PX
    && Math.abs(b.h - cardH) * DETECT_DPI <= SIZE_TOLERANCE_PX;

  const faces = [], backs = [];
  for (const { page, blocks, words } of found) {
    for (const box of blocks) {
      if (!isCard(box)) continue;
      (wordsIn(box, words).length ? faces : backs).push({ page, box, words });
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
