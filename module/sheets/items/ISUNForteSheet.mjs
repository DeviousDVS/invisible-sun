import { ISUNItemSheet } from "./ISUNItemSheet.mjs";

export class ISUNForteSheet extends ISUNItemSheet {
  static DEFAULT_OPTIONS = {
    classes: ["invisible-sun", "sheet", "item", "forte"],
    position: { width: 650, height: 750 },
  };

  static PARTS = {
    form: { template: "systems/invisible-sun/templates/item/forte-sheet.hbs" }
  };
}
