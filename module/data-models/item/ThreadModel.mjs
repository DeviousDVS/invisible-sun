/**
 * Invisible Sun — an aggregate: the raw material of Weaver magic
 *
 * An aggregate is the raw material of Weaver magic. Qualities define the
 * effects a thread can be woven into; absences are their opposite and define
 * what it cannot do — "Blood and Fire can be used to create a wave of healing
 * flames, but not a weapon effective against the dead" (The Way, p65).
 */
export class ThreadModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      description:     new fields.HTMLField({ required: false, initial: "" }),
      // Aggregate entries in The Way state these as plain words ("Short",
      // "Touch", "One round"), and weaving shifts them, so they are free text
      // rather than constrained to the spell range list.
      defaultDuration: new fields.StringField({ required: false, initial: "" }),
      defaultRange:    new fields.StringField({ required: false, initial: "" }),
      qualities:       new fields.ArrayField(new fields.StringField()),
      absences:        new fields.ArrayField(new fields.StringField()),
      color:           new fields.StringField({ required: false, initial: "", blank: true, choices: CONFIG.ISUN.spellColorChoices }),
    };
  }
}
