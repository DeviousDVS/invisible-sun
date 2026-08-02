import { ISUN } from "../../helpers/config.mjs";

/**
 * Invisible Sun — Minor Magic Item Data Model
 *
 * Cantrips, charms, hexes and signs. A category distinct from ephemera, whose
 * subtypes are conflux/charm/cypher/oddity — the shared "charm" name is a
 * collision, not a relationship.
 */
export class MinorMagicModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      minorMagicType: new fields.StringField({ required: true, initial: "cantrip", choices: Object.keys(ISUN.minorMagicTypes) }),
      level:          new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
      color:          new fields.StringField({ required: false, initial: "", blank: true, choices: Object.keys(ISUN.spellColorChoices) }),
      description:    new fields.HTMLField({ required: false, initial: "" }),
      depletion:      new fields.StringField({ required: false, initial: "" }),
    };
  }
}
