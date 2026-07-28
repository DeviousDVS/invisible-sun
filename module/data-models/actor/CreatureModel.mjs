import { baseNonPlayerSchema } from "../_fields.mjs";

/**
 * Invisible Sun — Creature Data Model
 */
export class CreatureModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      ...baseNonPlayerSchema(2),
      combat:      new fields.HTMLField({ required: false, initial: "" }),
      description: new fields.HTMLField({ required: false, initial: "" }),
    };
  }
}