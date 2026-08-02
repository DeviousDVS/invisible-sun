import { grantsSchema } from "../_fields.mjs";

/**
 * Invisible Sun — Order Item Data Model
 */
export class OrderModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      abbreviation:    new fields.StringField({ required: false, initial: "" }),
      magicStyle:      new fields.StringField({ required: false, initial: "" }),
      description:     new fields.HTMLField({ required: false, initial: "" }),
      uniqueMechanics: new fields.ObjectField({ required: false, initial: {} }),
      philosophy:      new fields.HTMLField({ required: false, initial: "" }),
      degrees:         new fields.ArrayField(new fields.StringField()),
      grants:      grantsSchema(),
    };
  }
}