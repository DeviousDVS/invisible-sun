import { ISUN } from "../../helpers/config.mjs";

/**
 * Invisible Sun — Connection Item Data Model
 *
 * People a vislae knows. Connections come from a character's Foundation and
 * can be bought with advancement; bonds with other player characters and with
 * NPCs are tracked here too, distinguished by `bondType` rather than by being
 * separate item types, since they carry the same fields.
 */
export class ConnectionModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      bondType:     new fields.StringField({ required: true, initial: "connection", choices: Object.keys(ISUN.bondTypes) }),
      level:        new fields.NumberField({ required: true, initial: 1, integer: true, min: 0 }),
      relationship: new fields.StringField({ required: false, initial: "" }),
      description:  new fields.HTMLField({ required: false, initial: "" }),
      notes:        new fields.HTMLField({ required: false, initial: "" }),
    };
  }
}
