import { ISUNSimpleActorSheet } from "./ISUNSimpleActorSheet.mjs";

export class ISUNCreatureSheet extends ISUNSimpleActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["creature"],
  };

  static PARTS = {
    form: { template: "systems/invisible-sun/templates/actor/creature-sheet.hbs" }
  };


}