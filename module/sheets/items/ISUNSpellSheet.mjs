import { ISUNItemSheet } from "./ISUNItemSheet.mjs";
import { ISUN } from "../../helpers/config.mjs";

export class ISUNSpellSheet extends ISUNItemSheet {
  static DEFAULT_OPTIONS = {
    classes: ["spell"],
  };

  static PARTS = {
    form: { template: "systems/invisible-sun/templates/item/spell-sheet.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    /* The class options carry their size, because the size is the rule. A
     * Vance prepares whatever fits into a three-inch square, so "Beta" alone
     * does not tell a player whether this spell will go in beside the one they
     * already have — "Beta (3 × 3 in)" does. */
    context.spellClassChoices = {
      "": "—",
      ...Object.fromEntries(Object.entries(ISUN.spellClasses).map(([key, spec]) =>
        [key, `${game.i18n.localize(spec.label)} (${spec.width} × ${spec.height} in)`]))
    };
    return context;
  }
}
