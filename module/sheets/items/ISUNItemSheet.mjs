const { ItemSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

import { SheetMixin } from "../SheetMixin.mjs";

export class ISUNItemSheet extends SheetMixin(HandlebarsApplicationMixin(ItemSheetV2)) {
  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["invisible-sun", "sheet", "item"],
    position: { width: 500, height: 600 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false }
  };

  static PARTS = {
    form: { template: "systems/invisible-sun/templates/item/item-sheet.hbs" }
  };
}
