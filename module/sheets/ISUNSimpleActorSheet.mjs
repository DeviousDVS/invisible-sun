const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;
import { ActorSheetMixin } from "./SheetMixin.mjs";

export class ISUNSimpleActorSheet extends ActorSheetMixin(HandlebarsApplicationMixin(ActorSheetV2)) {
  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["invisible-sun", "sheet", "actor"],
    position: { width: 600, height: 600 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false }
  };
}
