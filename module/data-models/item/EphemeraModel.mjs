import { ISUN } from "../../helpers/config.mjs";

/**
 * Invisible Sun — Ephemera Item Data Model
 */
export class EphemeraModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      level:        new fields.NumberField({ required: true, initial: 1, integer: true, min: 0 }),
      color:        new fields.StringField({ required: false, initial: "", blank: true, choices: Object.keys(ISUN.spellColorChoices) }),
      description:  new fields.HTMLField({ required: false, initial: "" }),
      ephemeraType: new fields.StringField({ required: true, initial: "conflux", choices: ["conflux","charm","cypher","oddity"] }),
    };
  }
}