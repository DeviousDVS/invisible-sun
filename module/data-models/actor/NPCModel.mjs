import { baseNonPlayerSchema } from "../_fields.mjs";

/**
 * Invisible Sun — NPC Data Model
 */
export class NPCModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      ...baseNonPlayerSchema(1),
      modifications: new fields.StringField({ required: false, initial: "" }),
      description:   new fields.HTMLField({ required: false, initial: "" }),
      notes:         new fields.HTMLField({ required: false, initial: "" }),
    };
  }
}