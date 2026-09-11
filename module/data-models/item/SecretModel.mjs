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

      /**
       * Whether using this secret makes the casting experimental.
       *
       * Experimental magic "is inherently unstable and will always be risky.
       * This instability or risk is reflected in flux, and the increased chance
       * for flux with experimental magic is represented in the requirement of
       * the Experimental Die" (The Nightside, p512). That die has nine blank
       * faces, so it never contributes to a success — it only ever adds the
       * chance of flux, and of worse flux.
       *
       * Every one of the eight things the books label "(EXPERIMENTAL EFFECT)"
       * is a secret, and none is experimental in itself: each makes some
       * *other* practice experimental when it is used. Experimental Spell
       * raises a spell's level for free "but you must roll an Experimental Die
       * when you cast it"; Wanton Casting spares one person from an area spell
       * and "you must roll an Experimental Die when attempting it".
       *
       * So this marks the secret, not the roll. Which practice it applies to,
       * and under what circumstance, is stated only in the description — which
       * is why nothing reads it at roll time yet, and why it sits beside
       * bonusDice rather than anywhere nearer the dice.
       */
      experimental: new fields.BooleanField({ required: true, initial: false }),

      description: new fields.HTMLField({ required: false, initial: "" }),
      secretType:  new fields.StringField({ required: true, initial: "character", choices: CONFIG.ISUN.secretTypes }),

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