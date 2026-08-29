/**
 * Invisible Sun — a forte, and the ordered path through its abilities
 *
 * A forte owns an ordered list of abilities: the books instruct a vislae to
 * "start with the first one and then select more, following the path
 * indicated", so `abilities` is a progression rather than a set. The abilities
 * themselves are separate Items — a character buys them individually with Crux
 * and must be able to own, roll and count them — so this holds their ids.
 */
export class ForteModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      description:   new fields.HTMLField({ required: false, initial: "" }),
      background:    new fields.HTMLField({ required: false, initial: "" }),
      appearance:    new fields.HTMLField({ required: false, initial: "" }),
      suggestedArcs: new fields.StringField({ required: false, initial: "" }),
      pathToJoy:     new fields.HTMLField({ required: false, initial: "" }),
      pathToDespair: new fields.HTMLField({ required: false, initial: "" }),

      /** Which book this forte comes from. */
      source:        new fields.StringField({ required: false, initial: "" }),

      /** Ability item ids, in the order the forte's progression follows. */
      abilities:     new fields.ArrayField(new fields.StringField()),

      /**
       * Every forte has a hidden capstone (The Threshold, p8243). It is not
       * bought — no Crux — and cannot be gained until the vislae holds every
       * other ability the forte offers, so it must never appear in a
       * "what can I purchase" list.
       */
      secretPower: new fields.SchemaField({
        name:           new fields.StringField({ required: false, initial: "Journey Into Mystery" }),
        level:          new fields.NumberField({ required: true, initial: 13, integer: true, min: 0 }),
        description:    new fields.HTMLField({ required: false, initial: "" }),
        requiresSecret: new fields.StringField({ required: false, initial: "Divine Ability" }),
      }),
    };
  }
}
