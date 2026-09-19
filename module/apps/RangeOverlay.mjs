/**
 * Invisible Sun — the four distances, drawn once
 *
 * "In Invisible Sun, distances are divided into four categories" (The Gate,
 * p22), and the point of them is that nobody measures: the GM says "he's near"
 * and play carries on. That works at a table with no map. On a canvas it goes
 * wrong quietly — everyone looks at the same picture and privately decides a
 * different thing is "near", and the disagreement only surfaces when a spell
 * does or does not reach.
 *
 * So this draws where the four words fall, from whoever is selected, while
 * Action Mode is running. It decides nothing and blocks nothing: it is the
 * same ruling the GM was always going to make, made visible before it is
 * needed rather than argued about after.
 *
 * ── Why only in Action Mode ──
 * Because that is when the answer has to be the same for everybody. In
 * Narrative Mode "near" is a word in a sentence and rings across the map would
 * be clutter. The toggle overrides this in both directions for a GM who wants
 * them out of combat, or none at all.
 *
 * ── Where it draws ──
 * Into `canvas.controls`, which exists on every scene, is rebuilt on each one,
 * and sits above the tokens. Above is the wrong side for an overlay, so the
 * fills are faint enough to be read through and the weight is carried by the
 * ring at each boundary. The alternative was registering a layer of our own in
 * CONFIG.Canvas.layers to sit under the tokens, which is a great deal of
 * apparatus for four circles and one more thing to keep in step with core.
 *
 * The reckoning itself is helpers/ranges.mjs, where it can be tested without a
 * canvas. This part is PIXI and hooks.
 */
import { rings, knownUnits, isMetric } from "../helpers/ranges.mjs";

const SCOPE = "invisible-sun";
export const RANGE_SETTING = "rangeOverlay";

/** What our container is called among canvas.controls' own children. */
export const CONTAINER = "isun-range-overlay";

/* Faint, because these sit on top of the tokens they are measured from. The
 * ring carries the meaning; the fill only says which side of it you are on. */
const FILL_ALPHA = 0.06;
const LINE_ALPHA = 0.55;
const LINE_WIDTH = 2;

export class RangeOverlay {

  /** @type {PIXI.Container|null} */
  static #layer = null;

  /* ──────────────────────────────────────────────
   * Whether to draw at all
   * ────────────────────────────────────────────── */

  /** The toggle. Per-client: one player wanting rings is not a table decision. */
  static get enabled() {
    return game.settings.get(SCOPE, RANGE_SETTING) ?? true;
  }

  static async setEnabled(on) {
    await game.settings.set(SCOPE, RANGE_SETTING, !!on);
    this.refresh();
  }

  /** Action Mode: a combat that has actually begun, not merely one that exists. */
  static get inActionMode() {
    return !!game.combat?.started;
  }

  /** Whose rings. The first controlled token, which is the one being moved. */
  static get anchor() {
    return canvas?.tokens?.controlled?.[0] ?? null;
  }

  /* ──────────────────────────────────────────────
   * Drawing
   * ────────────────────────────────────────────── */

  /**
   * Put the rings where they belong, or take them away.
   *
   * Everything routes through here — a token moving, a round beginning, the
   * toggle, a new scene — so there is one answer to "should these be showing"
   * and one place it is decided.
   */
  static refresh() {
    if (!canvas?.ready) return;
    const token = this.anchor;
    if (!this.enabled || !this.inActionMode || !token) return this.clear();
    this.#draw(token);
  }

  /** Take them away, keeping the container so the next draw is cheap. */
  static clear() {
    this.#layer?.removeChildren().forEach(child => child.destroy({ children: true }));
  }

  /** The container, attached to whatever canvas.controls is this scene. */
  static #container() {
    if (this.#layer?.parent !== canvas.controls) {
      this.#layer?.destroy({ children: true });
      this.#layer = canvas.controls.addChild(new PIXI.Container());
      /* Named so it can be told apart from core's own children of this layer —
       * the doors, the pings, the ruler paths — by anything looking, which
       * includes the tests and anyone in a debugger. */
      this.#layer.name = CONTAINER;
      this.#layer.eventMode = "none";
    }
    return this.#layer;
  }

  static #draw(token) {
    const layer = this.#container();
    this.clear();

    const scene = canvas.scene;
    const found = rings(scene.grid, scene.grid.units);
    if (!found.length) return;

    const { x, y } = token.center;
    const graphics = layer.addChild(new PIXI.Graphics());

    /* Outermost first, so the inner bands are painted over the outer ones and
     * a thing that is close reads as close rather than as four tints at once. */
    for (const band of [...found].reverse()) {
      graphics.lineStyle(LINE_WIDTH, band.colour, LINE_ALPHA)
        .beginFill(band.colour, FILL_ALPHA)
        .drawCircle(x, y, band.radius)
        .endFill();
    }

    for (const band of found) this.#label(layer, band, x, y, scene);
  }

  /**
   * The band's name at the top of its ring.
   *
   * With the distance and the scene's own units beside it, because the ring is
   * only as honest as the number behind it — and on a scene that never said
   * what its units are, a reader seeing "50 ft" against a grid they set up in
   * metres learns something the rings alone would hide. See `knownUnits`.
   */
  static #label(layer, band, x, y, scene) {
    const { PreciseText } = foundry.canvas.containers;
    const style = CONFIG.canvasTextStyle.clone();
    style.fontSize = Math.max(14, Math.round(canvas.dimensions.size / 5));
    style.fill = band.colour;

    const units = scene.grid.units || (isMetric(scene.grid.units) ? "m" : "ft");
    const text = layer.addChild(new PreciseText(
      `${game.i18n.localize(band.name)} · ${band.distance} ${units}`, style));
    text.anchor.set(0.5, 1);
    text.position.set(x, y - band.radius - 2);
  }

  /* ──────────────────────────────────────────────
   * When to redraw
   * ────────────────────────────────────────────── */

  /**
   * Arm the overlay. Called once at ready.
   *
   * `refreshToken` rather than `updateToken`, because a token being dragged
   * moves without updating until it is dropped, and rings that lag a drag are
   * worse than no rings — the whole use of them is judging a move before
   * committing it.
   */
  static listen() {
    const redraw = () => this.refresh();

    Hooks.on("canvasReady", redraw);
    Hooks.on("controlToken", redraw);
    Hooks.on("refreshToken", (token) => {
      if (token === this.anchor) this.refresh();
    });

    // Action Mode beginning, ending, or turning over.
    Hooks.on("createCombat", redraw);
    Hooks.on("updateCombat", redraw);
    Hooks.on("deleteCombat", redraw);

    /* A scene whose grid was re-measured while the rings were up would be
     * showing distances against the old scale. */
    Hooks.on("updateScene", (scene, changed) => {
      if (scene.id === canvas.scene?.id && "grid" in changed) this.refresh();
    });

    /* Said once per scene, and only to whoever could fix it. Rings drawn
     * against units nobody chose are not wrong so much as unfounded, and
     * silence would let them be read as the book's own answer. */
    Hooks.on("canvasReady", () => {
      if (!this.enabled || !game.user.isGM) return;
      if (knownUnits(canvas.scene?.grid?.units)) return;
      console.warn(`${SCOPE} | ${game.i18n.localize("ISUN.RangeNoUnits")}`);
    });
  }
}
