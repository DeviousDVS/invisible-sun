import { ISUNItemSheet } from "./ISUNItemSheet.mjs";

/**
 * Invisible Sun — a Sooth card
 *
 * The generic sheet walks the schema, which for this type produced the card as
 * a list of fields in declaration order: the round art squeezed into a square
 * thumbnail, the value as a slider because it is a 0–9 number, the two suns as
 * bare text boxes with no hint of what colour they are, and the five pieces of
 * prose that are the whole point of the card stacked below the fold.
 *
 * A Sooth card is looked at more than it is edited — it is turned face up on
 * the table and read out — so this sheet is the card first: the face on the
 * left, always visible, and The Gate's write-up beside it in tabs, none of it
 * more than one click away.
 *
 * Editing happens in place rather than in a second view. Every control here is
 * the real field, styled to read as the card until it is hovered or focused,
 * so nothing has to be switched into an edit mode to fix a typo.
 *
 * ── The suns and the effect share a slot ──
 * A card has one or the other, never both: a royalty card "shifts no sun; it
 * carries a special effect" (The Key, p6110), and the other thirty-six shift a
 * sun each way and print no effect text. So the face shows whichever the card
 * actually has, and setting a rank swaps one for the other.
 */
export class ISUNSoothCardSheet extends ISUNItemSheet {

  static DEFAULT_OPTIONS = {
    classes: ["sooth-card"],
    position: { width: 780, height: 660 }
  };

  static TABS = {
    primary: {
      initial: "card",
      tabs: [
        { id: "card",       label: "ISUN.SoothTabCard" },
        { id: "divination", label: "ISUN.SoothTabDivination" },
        { id: "narrative",  label: "ISUN.SoothTabNarrative" },
        { id: "shifts",     label: "ISUN.SoothTabShifts" }
      ]
    }
  };

  static PARTS = {
    form: { template: "systems/invisible-sun/templates/item/sooth-card-sheet.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.document.system;

    /* The suns are stored as the name printed on the card — "Blue", not the
     * `blue` key the rest of the system uses — so the option values have to be
     * those names. The label is localised; the value never is, or a translated
     * world would write a sun no reader could match. "Varies" is offered on a
     * spell and not here: a card names a sun or it names none. */
    context.sunChoices = Object.fromEntries([
      ["", "—"],
      ...Object.keys(CONFIG.ISUN.suns).map(key => [
        key.charAt(0).toUpperCase() + key.slice(1),
        game.i18n.localize(CONFIG.ISUN.suns[key].label)
      ])
    ]);

    const colourOf = (name) => CONFIG.ISUN.suns[String(name ?? "").toLowerCase()]?.color ?? "";
    context.enhancedColour = colourOf(system.enhancedSun);
    context.diminishedColour = colourOf(system.diminishedSun);
    context.royalty = Boolean(system.rank);
    context.rankLabel = system.rank ? game.i18n.localize(CONFIG.ISUN.soothRanks[system.rank]) : "";

    return context;
  }
}
