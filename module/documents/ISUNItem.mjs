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