import { ISUN } from "../../helpers/config.mjs";

import { grantsSchema } from "../_fields.mjs";

/**
 * Invisible Sun — a secret: what Acumen buys outside the spell lists
 */
export class SecretModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      /**
       * A secret's level is also its price: "Secrets are selected by characters
       * and cost Acumen to acquire — 1 per level of the secret" (The Way, p84).
       * So the number is the mechanical field and `cost` is only how it reads.
       */
      level:       new fields.NumberField({ required: true, initial: 1, integer: true, min: 0 }),
      cost:        new fields.StringField({ required: false, initial: "" }),

      /** Dice a secret adds to the action it applies to, where it adds any. */
      bonusDice:   new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),

      description: new fields.HTMLField({ required: false, initial: "" }),
      secretType:  new fields.StringField({ required: true, initial: "character", choices: ISUN.secretTypes }),

      // Changery secrets alone name a bodily change that must be made before
      // the secret does anything: "Change required: Bleed serpents (level 10)".
      // Empty for every other kind.
      changeRequired: new fields.StringField({ required: false, initial: "" }),

      /** Which book prints it, and the printed page — not the PDF's. */
      source:      new fields.StringField({ required: false, initial: "" }),
      page:        new fields.NumberField({ required: false, nullable: true, initial: null, integer: true }),

      grants:      grantsSchema(),
    };
  }
}