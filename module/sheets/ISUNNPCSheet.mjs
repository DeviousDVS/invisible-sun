import { ISUNSimpleActorSheet } from "./ISUNSimpleActorSheet.mjs";

export class ISUNNPCSheet extends ISUNSimpleActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["npc"],
  };

  static PARTS = {
    form: { template: "systems/invisible-sun/templates/actor/npc-sheet.hbs" }
  };


}