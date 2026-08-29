/**
 * Invisible Sun — a Sooth card
 *
 * A card carries only a name, a value and its suns on the card face; the rest
 * is written up in The Gate, a page to a card. The two are separate concerns:
 * the suns and the rank drive the mechanics, and everything else is what the
 * GM reads out when the card is turned.
 */
export class SoothCardModel extends foundry.abstract.DataModel {

  /**
   * `meaningStandard` held the card's meanings, alongside a `meaningInverted`
   * that was never used — Invisible Sun's Sooth Deck has no inverted meanings,
   * a card reads the same whichever way up it lands. The field is now
   * `meanings`; the old value is carried across so nothing entered by hand is
   * lost when the schema drops the key.
   */
  static migrateData(source) {
    if (source?.meaningStandard && !source.meanings) {
      source.meanings = source.meaningStandard;
    }
    return super.migrateData(source);
  }

  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      family:          new fields.StringField({ required: false, initial: "", blank: true, choices: { "": "", ...CONFIG.ISUN.soothFamilies } }),
      value:           new fields.NumberField({ required: true, initial: 0, integer: true, min: 0, max: 9 }),

      /** A royalty card carries a rank and shifts no sun; every other card
       *  shifts one sun up and another down. */
      rank:            new fields.StringField({ required: false, initial: "", blank: true, choices: { "": "", ...CONFIG.ISUN.soothRanks } }),
      enhancedSun:     new fields.StringField({ required: false, initial: "" }),
      diminishedSun:   new fields.StringField({ required: false, initial: "" }),
      /** What a royalty card does. A plain card's effect is its sun shift, so
       *  this is empty for those (The Key, p6110). */
      effectText:      new fields.HTMLField({ required: false, initial: "" }),

      /** The comma-separated list of what the card stands for. */
      meanings:        new fields.StringField({ required: false, initial: "" }),
      /** What the card says when it is read as a divination. */
      divination:      new fields.HTMLField({ required: false, initial: "" }),
      /** What the GM might bring into play on this card turn. */
      gameNarrative:   new fields.HTMLField({ required: false, initial: "" }),
      joy:             new fields.HTMLField({ required: false, initial: "" }),
      despair:         new fields.HTMLField({ required: false, initial: "" }),
      /** The card's own lore, and the aside printed under it. */
      description:     new fields.HTMLField({ required: false, initial: "" }),
      quote:           new fields.StringField({ required: false, initial: "" }),
      /** As printed: "Secrets • Ravens • Books • Flame". */
      familyLine:      new fields.StringField({ required: false, initial: "" }),
    };
  }
}
