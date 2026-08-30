/**
 * Invisible Sun — one effect off a flux chart
 *
 * "Any time a magic die is cast… there is a chance of magical flux. That occurs
 * when the 'extra' die — the magic die — comes up a 0… The GM determines the
 * flux effect and immediately turns a new Sooth card" (The Way, p13).
 *
 * Determines, not rolls. The three charts are a menu the GM chooses from, sized
 * by how many dice were cast, so an entry is a suggestion rather than a numbered
 * result — there is no die to record here and no position on a table.
 *
 * Ten of the hundred name something the sheet can do — a vex on a named pool, a
 * Sortilege spent, an Anguish, Hidden Knowledge lost — and `effects` carries
 * those, read out of the text once at import. The other ninety carry an empty
 * array, including five that mention a number and a game term but are none of
 * the sheet's business; way.mjs says which and why.
 */
export class FluxModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      /** Which chart it came off: minor, major or grand. */
      intensity:   new fields.StringField({ required: true, initial: "minor",
                     choices: CONFIG.ISUN.fluxIntensities }),
      description: new fields.HTMLField({ required: false, initial: "" }),

      /**
       * What the sheet could do about it, where the entry says so plainly.
       *
       * Never more than one — no entry states two — but an array because the
       * question "does this one do anything" is then a length rather than a
       * null check, and because a later book may.
       *
       * `pool` is empty for the kinds that name no pool. Amounts are signed:
       * a vex is gained, Sortilege and Hidden Knowledge are lost.
       */
      effects: new fields.ArrayField(new fields.SchemaField({
        kind:   new fields.StringField({ required: true, initial: "vex",
                  choices: ["vex", "pool", "anguish", "wound", "hiddenKnowledge"] }),
        pool:   new fields.StringField({ required: false, initial: "", blank: true }),
        amount: new fields.NumberField({ required: true, initial: 0, integer: true }),
      })),
      source:      new fields.StringField({ required: false, initial: "" }),
      page:        new fields.NumberField({ required: false, nullable: true, initial: null, integer: true }),
    };
  }
}
