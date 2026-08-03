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
  static migrateData(source) {
    if (Array.isArray(source?.degrees)) {
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

      /** Apostates only: what they begin with, having no first degree. */
      startingAbilities: new fields.ArrayField(namedAbility()),
      /** Apostates only: bought at 1 Crux each rather than by degree. */
      apostateAbilities: new fields.ArrayField(namedAbility()),

      grants: grantsSchema(),
    };
  }
}
