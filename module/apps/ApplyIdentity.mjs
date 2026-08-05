/**
 * Invisible Sun — applying an identity item's starting values
 *
 * A Foundation states what a vislae begins play with: weekly income, savings,
 * hidden knowledge and the house they keep (The Key). A character cannot change
 * foundation in play, so dropping one is always character creation — there is
 * nothing to protect and nothing to ask about. The values are simply assigned,
 * and swapping the foundation while building reassigns them to the new one.
 *
 * These are single-slot identities: the sheet reads the first of each type for
 * the character sentence, so a second would sit in the item list doing nothing.
 * Dropping one therefore replaces what was there.
 */

/**
 * What each identity type assigns, as { path, label, value } derived from it.
 *
 * Adding a type here is all that is needed for its drop to behave the same way
 * — a Heart's starting Certes and Qualia is the obvious next entry.
 */
const CONTRIBUTIONS = {
  Foundation: (item) => {
    const s = item.system;
    const out = [];
    const add = (path, label, value) => out.push({ path, label, value });

    if (s.weeklyIncome != null) add("system.economy.income", "income", s.weeklyIncome);
    // "Initial Savings: 100 crystal orbs" — the purse is denominated in coin,
    // and crystal is the denomination The Key states these in.
    if (s.initialSavings != null) add("system.economy.purse.crystal", "savings", s.initialSavings);
    if (s.startingHiddenKnowledge != null) {
      add("system.stats.hiddenKnowledge.value", "Hidden Knowledge", s.startingHiddenKnowledge);
    }
    if (s.houseType != null) add("system.house.type", "house", s.houseType);
    if (s.houseLevel != null) add("system.house.level", "house level", s.houseLevel);
    return out;
  }
};

export class ApplyIdentity {

  /** Whether this type is a single-slot identity that assigns starting values. */
  static handles(item) {
    return !!CONTRIBUTIONS[item?.type];
  }

  /**
   * Assign an item's starting values to an actor.
   * @returns {string[]} the labels of whatever actually changed.
   */
  static async apply(actor, item) {
    const changes = CONTRIBUTIONS[item.type]?.(item) ?? [];
    if (!changes.length) return [];

    const update = {};
    const changed = [];
    for (const c of changes) {
      const current = foundry.utils.getProperty(actor, c.path);
      // Everything is written, but only genuine differences are worth naming
      // back to the player.
      update[c.path] = c.value;
      if (String(current ?? "") !== String(c.value ?? "")) changed.push(c.label);
    }

    await actor.update(update);
    return changed;
  }
}
