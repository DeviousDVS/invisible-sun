/**
 * Invisible Sun — a heart: what a character is made of, and what they start with
 */
export class HeartModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      alternativeName:    new fields.StringField({ required: false, initial: "" }),
      description:        new fields.HTMLField({ required: false, initial: "" }),
      summary:            new fields.StringField({ required: false, initial: "" }),
      adjectives:         new fields.ArrayField(new fields.StringField()),
      startingCertes:     new fields.NumberField({ required: true, initial: 0, integer: true }),
      startingQualia:     new fields.NumberField({ required: true, initial: 0, integer: true }),
      startingPoolPoints: new fields.NumberField({ required: true, initial: 6, integer: true }),
      cardFamily:         new fields.StringField({ required: false, initial: "" }),
      associatedAnimal:   new fields.StringField({ required: false, initial: "" }),
      associatedObject:   new fields.StringField({ required: false, initial: "" }),
      skillsOptions:      new fields.ArrayField(new fields.StringField()),
      skillsGranted:      new fields.NumberField({ required: true, initial: 2, integer: true }),
      skillsLevel:        new fields.NumberField({ required: true, initial: 1, integer: true }),
    };
  }
}