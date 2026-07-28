import { ISUNItemSheet } from "./ISUNItemSheet.mjs";

export class ISUNCharacterArcSheet extends ISUNItemSheet {
  static DEFAULT_OPTIONS = {
    classes: ["character-arc"],
  };

  static PARTS = {
    form: { template: "systems/invisible-sun/templates/item/character-arc-sheet.hbs" }
  };
}