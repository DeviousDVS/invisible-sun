import { ISUN } from "../../helpers/config.mjs";

/**
 * Invisible Sun — Sooth Card Item Data Model
 */
export class SoothCardModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      family:          new fields.StringField({ required: false, initial: "", blank: true, choices: { "": "", ...ISUN.soothFamilies } }),
      value:           new fields.NumberField({ required: true, initial: 0, integer: true, min: 0, max: 9 }),
      meaningStandard: new fields.StringField({ required: false, initial: "" }),
      meaningInverted: new fields.StringField({ required: false, initial: "" }),
      effectText:      new fields.HTMLField({ required: false, initial: "" }),
      /** A royalty card carries a rank and shifts no sun; every other card
       *  shifts one sun up and another down. */
      rank:            new fields.StringField({ required: false, initial: "", blank: true, choices: { "": "", ...ISUN.soothRanks } }),
      enhancedSun:     new fields.StringField({ required: false, initial: "" }),
      diminishedSun:   new fields.StringField({ required: false, initial: "" }),
    };
  }
}