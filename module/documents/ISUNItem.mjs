import * as vance from "../helpers/vance.mjs";

/**
 * Extend the base Item document.
 */
export class ISUNItem extends Item {
  
  /** @override */
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);
    
    // Set default icons based on item type
    if (!data.img || data.img === "icons/svg/item-bag.svg") {
      const defaultIcons = CONFIG.ISUN?.itemTypeIcons || {};
      const img = defaultIcons[this.type];
      
      if (img) {
        this.updateSource({ img });
      }
    }

    this.#learnAsVance();
  }

  /**
   * A spell arriving on a Vance is learned the way a Vance learns.
   *
   * "Vances may wish to learn other spells and use them in their Vancian spell
   * method, storing them in their mind for later" (The Way, p57). It is what a
   * Vance does with a spell — their order *is* their spells — so it is the
   * default rather than a second step, and the Mind column on the practices
   * list is where a player takes it back for a spell they would rather cast out
   * of Sorcery.
   *
   * Here rather than in the picker so that every way a spell can arrive is
   * covered: the picker, a drag from a compendium, a drag from another
   * character, a GM handing one over.
   *
   * And cleared going the other way. Conversion is the character's, not the
   * spell's, so a spell dragged off a Vance onto a Weaver arrives as what it
   * always was — a Weaver who kept the flag would have a spell in a mind they
   * do not have.
   */
  #learnAsVance() {
    if (this.type !== "Spell") return;
    const actor = this.parent;
    /* A world item or a pack entry belongs to nobody and is converted by
     * nobody. Only a character's own copy carries this. */
    if (actor?.documentName !== "Actor") return;

    const isVance = actor.orderKey === "vance";
    if (isVance && vance.canConvert(this)) this.updateSource(vance.conversion(this, true));
    else if (!isVance && this.system?.converted) this.updateSource(vance.conversion(this, false));
  }

  /**
   * Determine if this item can be rolled into chat.
   * Spells, Incantations, and ForteAbilities with dice notations can be rolled.
   * @returns {boolean}
   */
  chatRollable() {
    if (this.type === "Spell" || this.type === "Incantation" || this.type === "ForteAbility") {
      return !!this.system.dice;
    }
    return false;
  }
}