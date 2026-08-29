/**
 * Invisible Sun — a soul, and the gift its guardian grants
 */
export class SoulModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      description:       new fields.HTMLField({ required: false, initial: "" }),
      symbolImage:       new fields.StringField({ required: false, initial: "" }),
      guardianGift:      new fields.HTMLField({ required: false, initial: "" }),
      cost:              new fields.StringField({ required: false, initial: "1 Crux" }),
      revelationPenalty: new fields.StringField({ required: false, initial: "" }),
    };
  }
}