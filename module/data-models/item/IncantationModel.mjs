import { ISUN } from "../../helpers/config.mjs";

/**
 * Invisible Sun — Incantation Item Data Model
 */
export class IncantationModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      level:       new fields.NumberField({ required: true, initial: 1, integer: true, min: 0 }),
      color:       new fields.StringField({ required: false, initial: "", blank: true, choices: ISUN.spellColorChoices }),
      cost:        new fields.StringField({ required: false, initial: "" }),
      range:       new fields.StringField({ required: false, initial: "", blank: true, choices: ISUN.ranges }),
      duration:    new fields.StringField({ required: false, initial: "" }),
      description: new fields.HTMLField({ required: false, initial: "" }),
      depletion:   new fields.StringField({ required: false, initial: "" }),
      dice:        new fields.StringField({ required: false, initial: "" }),
      facets:      new fields.StringField({ required: false, initial: "" }),
      /** The italic aside printed under the card's labels. */
      note:        new fields.HTMLField({ required: false, initial: "" }),
    };
  }
}