import { ISUN } from "../../helpers/config.mjs";

/**
 * Invisible Sun — Object of Power Item Data Model
 */
export class ObjectOfPowerModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      level:       new fields.NumberField({ required: true, initial: 1, integer: true, min: 0 }),
      description: new fields.HTMLField({ required: false, initial: "" }),
      depletion:   new fields.StringField({ required: false, initial: "" }),
      objectType:  new fields.StringField({ required: true, initial: "object", choices: ISUN.objectTypes }),
      /** The physical thing the magic lives in — every card states one. */
      form:        new fields.StringField({ required: false, initial: "" }),
      color:       new fields.StringField({ required: false, initial: "", blank: true, choices: ISUN.spellColorChoices }),
      dice:        new fields.StringField({ required: false, initial: "" }),
      /** The italic aside printed under the card's labels. */
      note:        new fields.HTMLField({ required: false, initial: "" }),
      /** An object that produces an ongoing effect depletes that effect
       *  separately from the object itself. */
      effectDepletion: new fields.StringField({ required: false, initial: "" }),
      /** Where the object is written up, as printed on the card. */
      reference:   new fields.StringField({ required: false, initial: "" }),
    };
  }
}