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
      objectType:  new fields.StringField({ required: true, initial: "artifact", choices: ISUN.objectTypes }),
    };
  }
}