/**
 * Invisible Sun — how far away a thing is
 *
 * "In Invisible Sun, distances are divided into four categories" (The Gate,
 * p22). Close is touch or a few steps, about 10 feet; near is 10 to 50; far is
 * 50 to 100, seen clearly but not reached quickly; very far is 100 to 500,
 * seen but not clearly.
 *
 * Four bands and no numbers in play is the point of them — a GM says "he's
 * near" and nobody measures. What the canvas can do is show where those words
 * fall, once, so that the table stops guessing and agreeing differently.
 *
 * ── Scaling ──
 * A scene says what one grid square is worth: `grid.size` in pixels and
 * `grid.distance` in `grid.units`. The ratio between them is the only thing
 * needed, and it holds on a gridless scene too, where Foundry still measures
 * distance by the same two numbers.
 *
 * ── Which units ──
 * The bands are printed in both feet and metres, so the scene is asked which it
 * is in rather than one being converted to the other. A scene that does not say
 * is read as feet, because that is what the greater part of Foundry's own
 * content assumes — and `knownUnits` exists so a caller can say so out loud
 * rather than quietly drawing rings against a number nobody chose.
 *
 * Nothing here touches the canvas. It takes the two numbers off a grid and
 * gives back radii, so the whole of the reckoning can be tested in Node.
 */

/** What a scene calls metres, and what it calls feet. */
const METRIC = /^\s*m(et(er|re)s?)?\.?\s*$/i;
const IMPERIAL = /^\s*(ft|foot|feet)\.?\s*$/i;

export function isMetric(units) {
  return METRIC.test(String(units ?? ""));
}

/**
 * Whether the scene said something this recognises.
 *
 * A scene whose units are blank is the common case rather than a broken one:
 * the units default to whatever the system's manifest declares, and a system
 * that declares none leaves every new scene with an empty string. Worth being
 * able to say so, because the rings are drawn against feet either way and a
 * reader deserves to know that was an assumption.
 */
export function knownUnits(units) {
  const text = String(units ?? "");
  return METRIC.test(text) || IMPERIAL.test(text);
}

/**
 * The four bands, in the scene's own units, innermost first.
 *
 * Ordered because it is an order — each band begins where the one before it
 * ends, so "near" is the ring between 10 and 50 rather than a circle of 50.
 */
export function bands(units) {
  const metric = isMetric(units);
  return Object.entries(CONFIG.ISUN.rangeDetails ?? {})
    .map(([key, band]) => ({
      key,
      name: band.name,
      hint: band.hint,
      colour: band.colour,
      distance: metric ? band.metres : band.distance
    }))
    .sort((a, b) => a.distance - b.distance);
}

/**
 * How many pixels one unit of scene distance is worth.
 *
 * Null rather than a number when the scene cannot answer — a distance of zero
 * would divide by it, and a ring of NaN draws as nothing while looking like a
 * bug somewhere else entirely.
 */
export function pixelsPerUnit(grid) {
  const size = Number(grid?.size);
  const distance = Number(grid?.distance);
  if (!Number.isFinite(size) || !Number.isFinite(distance)) return null;
  if (size <= 0 || distance <= 0) return null;
  return size / distance;
}

/**
 * The four bands as radii in pixels, innermost first.
 *
 * Empty when the scene cannot say what a pixel is worth, so a caller draws
 * nothing rather than drawing something wrong.
 */
export function rings(grid, units) {
  const per = pixelsPerUnit(grid);
  if (per === null) return [];
  return bands(units).map(band => ({ ...band, radius: band.distance * per }));
}

/**
 * Which band a distance falls in, or null beyond the last of them.
 *
 * Inclusive at the top of each band: the book's numbers are its boundaries —
 * "a distance of 10 to 50 feet" — and something exactly 50 away is near rather
 * than far, because that is the band whose sentence names it.
 */
export function bandAt(distance, units) {
  const away = Number(distance);
  if (!Number.isFinite(away) || away < 0) return null;
  return bands(units).find(band => away <= band.distance) ?? null;
}
