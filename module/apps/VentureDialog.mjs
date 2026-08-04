import { rollVenture } from "../helpers/dice.mjs";

/**
 * Invisible Sun — Venture Dialog
 *
 * "Subtract the venture from the challenge and that's the number you need to
 * roll on your die to succeed" (The Way, p254). Venture is the total of
 * everything the character brings to bear, and the rules are specific about
 * what each source contributes:
 *
 *   Skill        +1 per level, and skills only ever rise to 4 (The Key, p2558).
 *                Two skills may both apply when the situation warrants it.
 *   Bene         +1 to the venture each, spent from a pool relevant to the
 *                action (The Key, p1902).
 *   Enhancement  +1 *die*, not venture. Sortilege is measured in enhancements
 *                rather than bene, and magic can put them in other pools too.
 *
 * Spending is real: bene and enhancements are deducted from their pools when
 * the roll is made, so the dialog cannot be used to preview a spend for free.
 */
const { DialogV2 } = foundry.applications.api;

export class VentureDialog {

  /**
   * Open the dialog for an actor, optionally seeded with a skill.
   * @param {Actor} actor
   * @param {object} [options]
   * @param {Item}   [options.skill]      Skill to tick on open.
   * @param {number} [options.challenge]  Challenge, if something already knows it.
   * @param {string} [options.label]      What the roll is called in chat.
   * @param {number} [options.magicDice]  Magic dice the effect already grants.
   */
  static async open(actor, { skill = null, challenge = 0, label = "", magicDice = 0 } = {}) {
    const skills = actor.items.filter(i => i.type === "Skill")
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(i => ({
        id: i.id, name: i.name, level: i.system.level,
        category: i.system.category,
        checked: skill && i.id === skill.id
      }));

    const pools = this.#poolsOf(actor);

    const { renderTemplate } = foundry.applications.handlebars;
    const content = await renderTemplate(
      "systems/invisible-sun/templates/apps/venture-dialog.hbs",
      { skills, pools, challenge, magicDice, label: label || skill?.name || "Action" });

    const result = await DialogV2.wait({
      window: { title: `Venture — ${label || skill?.name || actor.name}` },
      content,
      buttons: [
        { action: "roll", label: "Roll", default: true, icon: "fa-solid fa-dice",
          callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
      ],
      render: (event, dialog) => this.#live(dialog.element),
      rejectClose: false
    });

    if (!result || result === "cancel") return null;
    return this.#roll(actor, skills, pools, result);
  }

  /** Every pool a bene or enhancement could come from. */
  static #poolsOf(actor) {
    const out = [];
    for (const stat of ["certes", "qualia"]) {
      const group = actor.system.stats?.[stat]?.pools ?? {};
      for (const [key, pool] of Object.entries(group)) {
        out.push({
          path: `system.stats.${stat}.pools.${key}.value`,
          key, stat,
          label: game.i18n.localize(`ISUN.Pool${key.charAt(0).toUpperCase()}${key.slice(1)}`),
          value: pool.value ?? 0,
          // Sortilege holds enhancements rather than bene, so it buys dice.
          isEnhancement: key === "sortilege"
        });
      }
    }
    return out;
  }

  /** Keep the running venture and target honest as the form is filled in. */
  static #live(root) {
    // A browser does not enforce `max` on a typed value, so a spend is clamped
    // here as well as when it is applied. Without this the preview promises a
    // venture the roll will not honour, because the pool has not got the bene.
    const spendOf = (el) => {
      const max = Number(el.max);
      let v = Math.max(0, Math.round(Number(el.value) || 0));
      if (Number.isFinite(max)) v = Math.min(v, max);
      if (String(v) !== el.value) el.value = v;
      return v;
    };

    const recalc = () => {
      let venture = 0;
      for (const el of root.querySelectorAll("input.skill-pick:checked")) {
        venture += Number(el.dataset.level) || 0;
      }
      for (const el of root.querySelectorAll("input.bene-spend")) {
        venture += spendOf(el);
      }
      venture += Number(root.querySelector('[name="modifier"]')?.value) || 0;

      let dice = Number(root.querySelector('[name="magicDice"]')?.value) || 0;
      for (const el of root.querySelectorAll("input.enh-spend")) {
        dice += spendOf(el);
      }

      const challenge = Number(root.querySelector('[name="challenge"]')?.value) || 0;
      const target = challenge - venture;

      root.querySelector(".venture-total").textContent = venture;
      const t = root.querySelector(".target-total");
      t.textContent = target <= 0 ? "auto" : target;
      t.classList.toggle("auto", target <= 0);
      // With no extra dice a target of 10 or more cannot be rolled at all.
      t.classList.toggle("impossible", target >= 10 && dice === 0);
    };

    root.querySelectorAll("input, select").forEach(el => {
      el.addEventListener("change", recalc);
      el.addEventListener("input", recalc);
    });
    recalc();
  }

  /** Deduct what was spent, then roll. */
  static async #roll(actor, skills, pools, form) {
    let venture = Number(form.modifier) || 0;
    const used = [];

    for (const s of skills) {
      if (form[`skill.${s.id}`]) {
        venture += s.level;
        used.push(`${s.name} +${s.level}`);
      }
    }

    let dice = Number(form.magicDice) || 0;
    const updates = {};
    for (const p of pools) {
      const spend = Math.max(0, Math.min(Number(form[`pool.${p.key}`]) || 0, p.value));
      if (!spend) continue;
      updates[p.path] = p.value - spend;
      if (p.isEnhancement) {
        dice += spend;
        used.push(`${spend} ${p.label} enhancement${spend > 1 ? "s" : ""}`);
      } else {
        venture += spend;
        used.push(`${spend} ${p.label} bene`);
      }
    }
    if (Object.keys(updates).length) await actor.update(updates);

    return rollVenture({
      challenge: Number(form.challenge) || 0,
      venture,
      magicDice: dice,
      label: form.label || "Action",
      actor,
      sources: used
    });
  }
}
