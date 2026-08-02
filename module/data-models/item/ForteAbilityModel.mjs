import { ISUN } from "../../helpers/config.mjs";

/**
 * Invisible Sun — Forte Ability Item Data Model
 */
export class ForteAbilityModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      level:       new fields.NumberField({ required: true, initial: 1, integer: true, min: 0 }),
      description: new fields.HTMLField({ required: false, initial: "" }),
      color:       new fields.StringField({ required: false, initial: "", blank: true, choices: Object.keys(ISUN.spellColorChoices) }),
      depletion:   new fields.StringField({ required: false, initial: "" }),
      parentForte: new fields.StringField({ required: false, initial: "" }),
    };
  }
}