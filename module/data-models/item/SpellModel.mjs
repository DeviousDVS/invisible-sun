import { ISUN } from "../../helpers/config.mjs";

/**
 * Invisible Sun — Spell Item Data Model
 */
export class SpellModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      level:       new fields.NumberField({ required: true, initial: 1, integer: true, min: 0 }),
      color:       new fields.StringField({ required: false, initial: "", blank: true, choices: Object.keys(ISUN.spellColorChoices) }),
      cost:        new fields.StringField({ required: false, initial: "" }),
      range:       new fields.StringField({ required: false, initial: "", blank: true, choices: Object.keys(ISUN.ranges) }),
      duration:    new fields.StringField({ required: false, initial: "" }),
      depletion:   new fields.StringField({ required: false, initial: "" }),
      description: new fields.HTMLField({ required: false, initial: "" }),
      spellType:   new fields.StringField({ required: true, initial: "general", choices: ["general","vance","weaver","goetic","maker"] }),
      dice:        new fields.StringField({ required: false, initial: "" }),
      facets:      new fields.StringField({ required: false, initial: "" }),
    };
  }
}