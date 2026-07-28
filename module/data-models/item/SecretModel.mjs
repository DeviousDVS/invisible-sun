/**
 * Invisible Sun — Secret Item Data Model
 */
export class SecretModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      cost:        new fields.StringField({ required: false, initial: "" }),
      description: new fields.HTMLField({ required: false, initial: "" }),
      secretType:  new fields.StringField({ required: true, initial: "character", choices: ["character","house","order","apostate"] }),
    };
  }
}