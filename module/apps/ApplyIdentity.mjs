/**
 * Invisible Sun — applying an identity item's starting values
 *
 * A Foundation states what a vislae begins play with: weekly income, savings,
 * hidden knowledge, the house they keep and how many connections they have
 * (The Key, p2558 onwards). Those are character-creation numbers, so dropping
 * one onto a sheet should offer to set them — but must not simply do it. A
 * Foundation dropped onto a character already in play would otherwise reset
 * their purse and their house, and dropping one to read its text is a perfectly
 * ordinary thing to do.
 *
 * So the drop asks, shows exactly what it would change, and applies only the
 * fields the item actually carries.
 */
const { DialogV2 } = foundry.applications.api;

/**
 * What each identity type contributes, as a list of
 * { path, label, value } derived from the item.
 *
 * Adding a type here is all that is needed to make its drop offer the same
 * thing — a Heart's starting Certes and Qualia are the obvious next entry.
 */
const CONTRIBUTIONS = {
  Foundation: (item) => {
    const s = item.system;
    const out = [];
    const add = (path, label, value) => out.push({ path, label, value });

    if (s.weeklyIncome != null) add("system.economy.income", "Weekly income", s.weeklyIncome);
    // "Initial Savings: 100 crystal orbs" — the purse is denominated in coin,
    // and crystal is the denomination The Key states these in.
    if (s.initialSavings) add("system.economy.purse.crystal", "Savings (crystal orbs)", s.initialSavings);
    if (s.startingHiddenKnowledge != null) {
      add("system.stats.hiddenKnowledge.value", "Hidden Knowledge", s.startingHiddenKnowledge);
    }
    if (s.houseType) add("system.house.type", "House", s.houseType);
    if (s.houseLevel != null) add("system.house.level", "House level", s.houseLevel);
    return out;
  }
};

export class ApplyIdentity {

  /** Whether dropping this item offers anything to apply. */
  static handles(item) {
    return !!CONTRIBUTIONS[item?.type];
  }

  /**
   * Offer to apply an item's starting values to an actor.
   * @returns {boolean} whether anything was written.
   */
  static async offer(actor, item) {
    const changes = CONTRIBUTIONS[item.type]?.(item) ?? [];
    if (!changes.length) return false;

    const rows = changes.map(c => {
      const current = foundry.utils.getProperty(actor, c.path);
      const same = String(current ?? "") === String(c.value ?? "");
      return `<tr class="${same ? "unchanged" : ""}">
          <td>${foundry.utils.escapeHTML(c.label)}</td>
          <td class="from">${foundry.utils.escapeHTML(String(current ?? "—"))}</td>
          <td class="to">${foundry.utils.escapeHTML(String(c.value ?? "—"))}</td>
        </tr>`;
    }).join("");

    const applied = await DialogV2.wait({
      window: { title: `Apply ${item.name}?` },
      content: `<div class="isun-apply-identity">
          <p>${foundry.utils.escapeHTML(item.name)} sets these starting values.
             The item is added either way.</p>
          <table>
            <thead><tr><th>Value</th><th>Now</th><th>Would become</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`,
      buttons: [
        { action: "apply", label: "Apply", default: true, icon: "fa-solid fa-check" },
        { action: "skip", label: "Just add the item", icon: "fa-solid fa-xmark" }
      ],
      rejectClose: false
    });

    if (applied !== "apply") return false;
    await actor.update(Object.fromEntries(changes.map(c => [c.path, c.value])));
    return true;
  }
}
