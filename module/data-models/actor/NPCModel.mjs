import { baseNonPlayerSchema } from "../_fields.mjs";

/**
 * Invisible Sun — an NPC: a level, and the modifications that shift it
 */
export class NPCModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      ...baseNonPlayerSchema(1),
      description:   new fields.HTMLField({ required: false, initial: "" }),
      notes:         new fields.HTMLField({ required: false, initial: "" }),
    };
  }
}