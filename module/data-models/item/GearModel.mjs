import { ISUN } from "../../helpers/config.mjs";

/**
 * Invisible Sun — Gear Item Data Model
 *
 * The goods a vislae buys: furniture, clothes, tools, weapons, poisons,
 * passage on a skyship. The Key sets them out in fourteen sections of priced
 * tables, and unlike every other kind of item in this system they are not
 * printed on cards — the Objects of Power Deck carries the fifty kindled items
 * among them and nothing else.
 *
 * Kindled and aethyric are flags rather than a type, because the book marks
 * them that way: an asterisk against the entry in whichever list it belongs to,
 * two for aethyric (The Key p183, p185). A kindled coat is still a coat, and
 * it is still filed under Clothing.
 *
 * What a kindled item does — "3 bene Accuracy, 1 vex Interaction" — is left in
 * the description, where the book puts it. Reading those into a schema would
 * only be worth doing if something applied them, and nothing does: Armor is a
 * number on the actor and pools are filled by hand.
 */
export class GearModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      category:    new fields.StringField({ required: true, initial: "other", choices: ISUN.goodsCategories }),
      /** The table an entry sits in, where its section is divided: "Footgear",
       *  "Meals and Drinks", "Ingredients". Free text — it is a heading, and
       *  a heading is whatever the book felt like writing. */
      subcategory: new fields.StringField({ required: false, initial: "" }),
      /** As printed, in whatever currencies the entry names: "5 crystal orbs",
       *  "3 gem orbs and 25 bloodsilver", "200 crystal orbs deposit, 40
       *  crystal orbs per week". Prices this varied are worth more kept whole
       *  than parsed into a number that cannot hold half of them. */
      cost:        new fields.StringField({ required: false, initial: "" }),
      description: new fields.HTMLField({ required: false, initial: "" }),
      /** Weapons, poisons and crafting materials state a level; furniture does
       *  not. Zero means the entry does not have one. */
      level:       new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
      /** Weapons only, and never stated on the entry itself — it is printed
       *  once over the table, "Light (all inflict 2 points of damage)". */
      damage:      new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
      kindled:     new fields.BooleanField({ required: true, initial: false }),
      aethyric:    new fields.BooleanField({ required: true, initial: false }),
      quantity:    new fields.NumberField({ required: true, initial: 1, integer: true, min: 0 }),
    };
  }
}
