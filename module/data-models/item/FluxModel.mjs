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
 * The text is the whole of it for now. Some entries name something the system
 * already models — "You gain 1 vex to Sorcery", "You lose 1 Sortilege out of
 * your pool", "Someone close to you suffers 2 damage" — and applying those is
 * the next phase; the field it would need is deliberately absent until then
 * rather than sitting empty on every one of a hundred entries.
 */
export class FluxModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      /** Which chart it came off: minor, major or grand. */
      intensity:   new fields.StringField({ required: true, initial: "minor",
                     choices: CONFIG.ISUN.fluxIntensities }),
      description: new fields.HTMLField({ required: false, initial: "" }),
      source:      new fields.StringField({ required: false, initial: "" }),
      page:        new fields.NumberField({ required: false, nullable: true, initial: null, integer: true }),
    };
  }
}
