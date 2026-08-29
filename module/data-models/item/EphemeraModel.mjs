import { ISUN } from "../../helpers/config.mjs";

/**
 * Invisible Sun — an ephemera object — magic that is carried and used up
 */
export class EphemeraModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      level:        new fields.NumberField({ required: true, initial: 1, integer: true, min: 0 }),
      color:        new fields.StringField({ required: false, initial: "", blank: true, choices: ISUN.spellColorChoices }),
      description:  new fields.HTMLField({ required: false, initial: "" }),
      ephemeraType: new fields.StringField({ required: true, initial: "conflux", choices: ISUN.ephemeraTypes }),
      /** The physical thing the magic lives in — every card states one. */
      form:         new fields.StringField({ required: false, initial: "" }),
      depletion:    new fields.StringField({ required: false, initial: "" }),
      dice:         new fields.StringField({ required: false, initial: "" }),
      /** The italic aside printed under the card's labels. */
      note:         new fields.HTMLField({ required: false, initial: "" }),
    };
  }
}