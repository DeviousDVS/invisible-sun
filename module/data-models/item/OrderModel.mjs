import { grantsSchema } from "../_fields.mjs";

/**
 * Invisible Sun — Order Item Data Model
 *
 * An order is a ladder of six degrees. Each costs Crux equal to the degree
 * being entered, carries a story requirement that "always requires interacting
 * in some way with other members of your order", and grants named abilities
 * (The Key, p205). Apostates are the exception: no degrees at all, a fixed set
 * of starting abilities, and further abilities bought at 1 Crux each.
 */
export class OrderModel extends foundry.abstract.DataModel {

  /**
   * `degrees` was an array of plain strings holding a title and nothing else.
   * Rebuild those as objects so the old titles survive, even though the cost,
   * requirement and grants they never carried will be empty until the item is
   * replaced from the compendium.
   */
  /**
   * Fill in `grants` for an Order dragged in before the field existed.
   *
   * The same three patterns build_compendia.js uses, and the only place they
   * still run against live text. That is tolerable here and was not tolerable
   * in ISUNActor: this runs once, against source that predates the change and
   * is therefore known to be the original English, whereas derivation ran on
   * every preparation against whatever the text had since become.
   *
   * Only when the key is absent. An ability that genuinely grants nothing has
   * zeroes, and re-deriving those every load would undo a deliberate edit.
   */
  static #fillLegacyGrants(ability) {
    if (!ability || typeof ability !== "object" || ability.grants) return ability;
    const NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
    const word = m => NUMBERS[m?.[1]?.toLowerCase()] ?? 0;
    const text = String(ability.description ?? "");
    ability.grants = {
      ephemera:     word(text.match(/\b(one|two|three|four|five|six)\s+ephemera\b/i)),
      incantations: word(text.match(/only\s+(one|two|three|four|five|six)\s+of these can be incantations/i)),
      conation:     word(text.match(/\b(one|two|three|four|five|six)\b[^.]*conation/i)),
    };
    return ability;
  }

  static migrateData(source) {
    for (const list of [source?.startingAbilities, source?.apostateAbilities]) {
      if (Array.isArray(list)) list.forEach(a => this.#fillLegacyGrants(a));
    }
    if (Array.isArray(source?.degrees)) {
      for (const d of source.degrees) {
        if (Array.isArray(d?.abilities)) d.abilities.forEach(a => this.#fillLegacyGrants(a));
      }
      source.degrees = source.degrees.map((d, i) => {
        if (d && typeof d === "object") return d;
        const title = String(d ?? "");
        // Old titles were written "3rd Degree: Master of the Loom".
        const m = title.match(/^\s*(\d+)\w*\s*Degree:\s*(.*)$/i);
        return {
          degree: m ? Number(m[1]) : i + 1,
          title: (m ? m[2] : title).trim(),
          cruxCost: m ? Number(m[1]) : i + 1,
          requirement: "", abilities: []
        };
      });
    }
    return super.migrateData(source);
  }

  static defineSchema() {
    const fields = foundry.data.fields;

    const namedAbility = () => new fields.SchemaField({
      name:        new fields.StringField({ required: false, initial: "" }),
      description: new fields.HTMLField({ required: false, initial: "" }),

      /**
       * What attaining this ability entitles its holder to.
       *
       * These numbers used to be read out of the description at derivation
       * time, by regexes looking for "four ephemera" and "only two of these can
       * be incantations". That worked, and it was fragile in a way that failed
       * silently: reword the sentence, or translate the compendium, and a
       * character's caps quietly drop to the base with nothing said.
       *
       * They are extracted once now, at build time, by scripts/build_compendia.js
       * — where the text is known to be the English the regexes were written
       * against, and where a mismatch can be caught before anyone plays. Zero
       * means "grants nothing", which is true of most abilities.
       */
      grants: new fields.SchemaField({
        /** How many ephemera the holder may bear (The Key, p36). A total, not a bonus. */
        ephemera:     new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
        /** How many of those ephemera may be incantations. A restriction, not an entitlement. */
        incantations: new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
        /** How many incantations may be ones the character chose rather than was given. */
        conation:     new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
      }),
    });

    return {
      abbreviation:    new fields.StringField({ required: false, initial: "" }),
      magicStyle:      new fields.StringField({ required: false, initial: "" }),
      description:     new fields.HTMLField({ required: false, initial: "" }),
      otherNames:      new fields.StringField({ required: false, initial: "" }),
      philosophy:      new fields.HTMLField({ required: false, initial: "" }),
      relationships:   new fields.HTMLField({ required: false, initial: "" }),
      pathToJoy:       new fields.HTMLField({ required: false, initial: "" }),
      pathToDespair:   new fields.HTMLField({ required: false, initial: "" }),
      uniqueMechanics: new fields.ObjectField({ required: false, initial: {} }),

      degrees: new fields.ArrayField(new fields.SchemaField({
        degree:      new fields.NumberField({ required: true, initial: 1, integer: true, min: 1 }),
        title:       new fields.StringField({ required: false, initial: "" }),
        /** Crux equal to the degree being entered (The Key, p205). */
        cruxCost:    new fields.NumberField({ required: true, initial: 1, integer: true, min: 0 }),
        requirement: new fields.HTMLField({ required: false, initial: "" }),
        abilities:   new fields.ArrayField(namedAbility()),
      })),

      /**
       * Rules and references the book sets in the margin or in a box beside the
       * degree entries. They belong to the order rather than to any one ability
       * — that a Goetic may have only one summoned entity at a time is a
       * sidebar — and carrying no label of their own, they used to be read as
       * more of whichever ability they happened to follow.
       */
      sidebars: new fields.ArrayField(new fields.HTMLField()),

      /** Apostates only: what they begin with, having no first degree. */
      startingAbilities: new fields.ArrayField(namedAbility()),
      /** How many of the starting set a beginning Apostate actually takes. */
      startingNote: new fields.StringField({ required: false, initial: "" }),
      /** Apostates only: bought at 1 Crux each rather than by degree. */
      apostateAbilities: new fields.ArrayField(namedAbility()),
      /** What buying one costs, which is a rule about the list, not an ability. */
      apostateNote: new fields.StringField({ required: false, initial: "" }),

      grants: grantsSchema(),
    };
  }
}
