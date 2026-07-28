import { ISUNItemSheet } from "./ISUNItemSheet.mjs";

export class ISUNSpellSheet extends ISUNItemSheet {
  static DEFAULT_OPTIONS = {
    classes: ["spell"],
  };

  static PARTS = {
    form: { template: "systems/invisible-sun/templates/item/spell-sheet.hbs" }
  };
}