/**
 * Invisible Sun — a character arc, as the beats it is made of
 *
 * An arc is a shape rather than a record: an opening that is paid for, one to
 * four steps through the middle, a climax, and a resolution. Each beat carries
 * what happens, what completing it pays, and whether it has happened yet.
 *
 * The sheet used to show three of those and not the steps — so between one and
 * four beats of every arc in the book were on the item and reachable from
 * nowhere, which across the pack is eighty of them. It also asked for each
 * description in a single-line input, against text that runs to seven hundred
 * characters.
 *
 * ── One row, four kinds ──
 * The beats are prepared as one list here rather than as four blocks in the
 * template, so the template draws a beat once and the arc's order is data. A
 * step is then the same thing as a climax with an index and a delete control,
 * which is what it always was.
 *
 * Everything but adding and removing a step is a plain named field. The sheet
 * submits on change, so the form writes them; the two array operations are the
 * only things that need a hand.
 */
import { ISUNItemSheet } from "./ISUNItemSheet.mjs";

export class ISUNCharacterArcSheet extends ISUNItemSheet {
  static DEFAULT_OPTIONS = {
    classes: ["character-arc"],
    position: { width: 620, height: 760 },
    actions: {
      arcAddStep: ISUNCharacterArcSheet.#onAddStep,
      arcRemoveStep: ISUNCharacterArcSheet.#onRemoveStep
    }
  };

  static PARTS = {
    form: { template: "systems/invisible-sun/templates/item/character-arc-sheet.hbs" }
  };

  /** What a step starts as. The reward is blank because the books vary. */
  static #BLANK_STEP = { description: "", reward: "", completed: false };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const s = this.document.system ?? {};

    const beat = (part, path, label, kind, extra = {}) => ({
      kind,
      label,
      path,
      title: part?.title ?? "",
      description: part?.description ?? "",
      reward: part?.reward ?? "",
      completed: !!part?.completed,
      ...extra
    });

    context.beats = [
      beat(s.opening, "system.opening", game.i18n.localize("ISUN.ArcOpening"), "opening"),
      ...(s.steps ?? []).map((step, i) =>
        beat(step, `system.steps.${i}`,
          game.i18n.format("ISUN.ArcStep", { n: i + 1 }), "step", { index: i })),
      beat(s.climax, "system.climax", game.i18n.localize("ISUN.ArcClimax"), "climax"),
      beat(s.resolution, "system.resolution", game.i18n.localize("ISUN.ArcResolution"), "resolution")
    ];

    /* Where "add a step" goes: after the last step, or after the opening when
     * there are none. A new step belongs in the middle of an arc, not at the
     * end of it, and marking the beat is how the template knows without
     * counting backwards from the climax. */
    const steps = s.steps ?? [];
    const addAfter = steps.length ? 1 + steps.length - 1 : 0;
    context.beats[addAfter].addHere = true;

    /* How far along, for the line under the title. Counted off the beats rather
     * than off the model, so it cannot disagree with what is drawn. */
    context.done = context.beats.filter(b => b.completed).length;
    context.total = context.beats.length;
    context.progress = game.i18n.format("ISUN.ArcProgress",
      { done: context.done, total: context.total });
    context.hasSteps = (s.steps ?? []).length > 0;
    return context;
  }

  static async #onAddStep() {
    const steps = [...(this.document.system.steps ?? [])];
    steps.push({ ...ISUNCharacterArcSheet.#BLANK_STEP });
    await this.document.update({ "system.steps": steps });
  }

  /**
   * The whole array is written back, not the one entry: an ArrayField has no
   * notion of deleting an index, and a shorter array is what removal means.
   */
  static async #onRemoveStep(event, target) {
    const index = Number(target.dataset.index);
    const steps = [...(this.document.system.steps ?? [])];
    if (!Number.isInteger(index) || index < 0 || index >= steps.length) return;
    steps.splice(index, 1);
    await this.document.update({ "system.steps": steps });
  }
}
