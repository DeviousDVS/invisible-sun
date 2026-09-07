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

    this.#forgetVancianLearning();
  }

  /**
   * Conversion belongs to the character, not to the spell.
   *
   * "Vances may wish to learn other spells and use them in their Vancian spell
   * method" (The Way, p57) — wish to, at twice the time it took to learn the
   * spell in the first place. So it is something a player decides and does, on
   * the practices list, and never something that happens to a spell for having
   * arrived somewhere.
   *
   * What is done here is the other direction, which nobody decides. A spell
   * carried off a Vance onto anyone else arrives as what it always was: a
   * Weaver who kept the flag would have a spell held in a mind they do not
   * have, and it would cast for nothing on the strength of a stale tick.
   */
  #forgetVancianLearning() {
    if (this.type !== "Spell" || !this.system?.converted) return;
    /* A world item or a pack entry belongs to nobody. Only a character's own
     * copy carries this, so only a copy landing on a character is checked. */
    const actor = this.parent;
    if (actor?.documentName !== "Actor") return;
    if (actor.orderKey !== "vance") this.updateSource(vance.conversion(this, false));
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