/**
 * Invisible Sun — Dice So Nice! integration
 *
 * Three things differ from a stock d10 and all of them are label work rather
 * than new geometry:
 *
 *   Faces read 0-9.  Foundry rolls 1..10, so the tenth face carries the 0.
 *                    Without this the 3D die shows a 10 while the chat result
 *                    says 0.
 *   The Experimental Die has nine blank faces and one marked one. Dice So Nice
 *                    draws a label as text unless it ends in an image
 *                    extension, and an empty string draws nothing at all, so
 *                    blank faces need no asset.
 *   The nine suns    are already colours in the system config, so each gets a
 *                    colourset and a magic die can be rolled in the colour of
 *                    the sun it belongs to.
 *
 * The marked face uses CONFIG.ISUN.fluxGlyph, the same mark the chat card shows.
 * Duvall carries the numerals but has no symbol glyph — its character set is
 * Latin and basic punctuation only.
 */

/**
 * The family name, quotes included — Dice So Nice's own FA_PRO_FAMILY is the
 * same string.
 *
 * The quotes are not decoration. Dice So Nice builds a canvas font shorthand
 * by concatenation, and "Font Awesome 7 Pro" unquoted is not valid CSS because
 * a family name cannot start a component with a digit. A canvas silently
 * ignores an invalid font assignment and keeps the one it had, so the whole
 * declaration is discarded — including the size. That is what makes fontScale
 * look broken: it is computed correctly and then thrown away with everything
 * else, leaving the glyph at the default 10px.
 *
 * Matching this string exactly is also what makes Dice So Nice prepend the
 * 900 weight the solid faces need.
 */
const FA = '"Font Awesome 7 Pro"';

/**
 * One label per face, in face order. Nothing else.
 *
 * Dice So Nice keeps index 0 as a placeholder and reads faces from index 1,
 * but it prepends that placeholder itself when the textures are built — the
 * array is stored exactly as given and only grows later. Inspecting a preset
 * after load therefore shows one more entry than was passed, and matching that
 * shape on the way in shifts every face by one. Reading the stock d10 and
 * copying its eleven entries is exactly the wrong move.
 *
 * The stock d10 is already labelled 0-9, as an Invisible Sun die reads, so
 * this preset exists only to set the numerals in Duvall.
 */
const IS_FACES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

export function registerDiceSoNice() {
  Hooks.once("diceSoNiceReady", (dice3d) => {
    /* Nine blanks, then the marked face. Built here rather than at module
     * scope: CONFIG.ISUN is populated during init, and this module is imported
     * before that hook runs. */
    const experimentalFaces = ["", "", "", "", "", "", "", "", "", CONFIG.ISUN.fluxGlyph];

    // "preferred", not "default". A system registered as "default" is only
    // added to the list a player can choose from — it is never actually used,
    // so every preset below would be dead weight and no amount of adjusting
    // them changes a die. "preferred" makes them the ones that render, and
    // Dice So Nice only promotes it while the choice is still "standard", so a
    // player who has picked their own dice keeps them.
    dice3d.addSystem({ id: "invisible-sun", name: "Invisible Sun" }, "preferred");

    dice3d.addDicePreset({
      type: "d10",
      system: "invisible-sun",
      labels: IS_FACES,
      font: "Duvall"
    });

    // A d10 in shape; only the reading of it differs, so it borrows that
    // geometry rather than shipping a model.
    dice3d.addDicePreset({
      type: "de",
      system: "invisible-sun",
      labels: experimentalFaces,
      font: FA,
      // A direct multiplier on the label size, not a percentage: Dice So
      // Nice's own defaults run from 0.45 to 2 and a d10 is 1. A lone symbol
      // on an otherwise empty face carries a larger mark than a numeral would.
      fontScale: 0.8,
      colorset: "isun-experimental"
    }, "d10");

    for (const [key, sun] of Object.entries(CONFIG.ISUN.suns)) {
      const label = key.charAt(0).toUpperCase() + key.slice(1);
      const fg = labelFor(sun.color);
      dice3d.addColorset({
        name: `isun-${key}`,
        description: `${label} Sun`,
        category: "Invisible Sun",
        background: sun.color,
        foreground: fg,
        outline: fg === LABEL_DARK ? LABEL_PALE : "#000000",
        texture: "none",
        material: "metal",
        font: "Duvall"
      }, "default");
    }

    // The Experimental Die is not one of the Nine and reusing a sun's colours
    // washed the mark out — the Invisible Sun is a light gold, so its symbol
    // sat near-white on near-white. It gets its own: a dark die so the one
    // mark that matters carries the flux colour and is the only thing on it.
    dice3d.addColorset({
      name: "isun-experimental",
      description: "Experimental Die",
      category: "Invisible Sun",
      background: "#14121a",
      foreground: FLUX_COLOUR,
      outline: "#000000",
      edge: "#2a2436",
      texture: "none",
      material: "metal",
      font: FA
    }, "default");
  });
}

/** The flux red the sheets and chat cards already use. */
const FLUX_COLOUR = "#e74c3c";

const LABEL_DARK = "#14121a";
const LABEL_PALE = "#f5f0e6";

/** WCAG relative luminance. */
function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ""));
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const srgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

/**
 * The more legible of the two label colours on a given die colour.
 *
 * Picking on a luminance threshold puts an arbitrary line through the middle
 * of the range, and several suns sit right on it — the Invisible Sun's gold
 * lands within a thousandth of any sensible cutoff, and whichever side it
 * falls is a coin toss rather than a judgement. Comparing the contrast each
 * label would actually achieve has no such edge.
 */
function labelFor(background) {
  const bg = luminance(background);
  const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return ratio(bg, luminance(LABEL_DARK)) >= ratio(bg, luminance(LABEL_PALE))
    ? LABEL_DARK : LABEL_PALE;
}

/**
 * The colourset a die should wear, given the colour of the magic being worked.
 * Returns undefined for anything that is not one of the Nine, which leaves the
 * die at the player's own choice of appearance.
 */
export function colorsetForSun(colour) {
  const key = String(colour ?? "").toLowerCase();
  return CONFIG.ISUN.suns[key] ? `isun-${key}` : undefined;
}
