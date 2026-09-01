import { rollVenture } from "../helpers/dice.mjs";
import * as poolRules from "../helpers/pools.mjs";
import * as sooth from "../helpers/sooth.mjs";

/**
 * Invisible Sun — rolling against a challenge
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
 *
 * ── When the action names its pool ──
 * A skill roll draws on whatever the situation warrants, so every pool is
 * offered and the player says which one they are paying from. A magical
 * practice does not: it draws on Sorcery, and naming that pool is what lets the
 * two things the pool itself brings reach the roll.
 *
 *   Scourge  applies to every action drawing on the pool and is not spent
 *            (The Key, p2242). Shown, already counted, and not declinable.
 *   Vex      "spent to subtract 1 from a venture, and the GM decides when"
 *            (The Key, p2241). Offered, because the deciding is the GM's, and
 *            consumed from the pool when the roll is made.
 *
 * Neither bene nor skills are offered against a declared pool. Both can apply
 * to a magical practice by the rules — "any character can add 1 to the venture
 * of a magical action by spending 1 bene" (The Way, p8), and a skill can be
 * argued to bear on a casting — but both are rare enough there that carrying
 * the controls costs every cast more than it saves the occasional one. The
 * Other modifier field approximates either when it comes up.
 *
 * Sortilege stays: it buys dice rather than venture, and is not bene.
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
   * @param {number} [options.base]       Venture the action carries in itself —
   *                                      a practice's level, which "you always
   *                                      add" and so cannot be declined.
   * @param {string} [options.baseLabel]  What to call it in the dialog.
   * @param {string} [options.pool]       The pool the action draws on, if the
   *                                      action knows. Brings the pool's scourge
   *                                      and vex to the roll, and withdraws the
   *                                      skill and bene controls.
   */
  static async open(actor, { skill = null, challenge = 0, label = "", magicDice = 0,
                             base = 0, baseLabel = "", practice = null,
                             pool = "" } = {}) {
    /* Empty against a declared pool, which is what withdraws the picker: the
     * template guards on the length, and #live and #roll can then find no level
     * to add for a skill that was never offered. One decision, three places
     * that cannot disagree about it. */
    const skills = pool ? [] : actor.items.filter(i => i.type === "Skill")
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(i => ({
        id: i.id, name: i.name, level: i.system.level,
        category: i.system.category,
        checked: skill && i.id === skill.id
      }));

    const pools = this.#poolsOf(actor, pool);
    const drain = this.#drainOf(actor, pool);
    // Read once, and carried to the roll: see ChallengeResponse on why the
    // board is not read again as the dice land.
    const board = await sooth.ventureFor(actor);

    const { renderTemplate } = foundry.applications.handlebars;
    const content = await renderTemplate(
      "systems/invisible-sun/templates/apps/venture-dialog.hbs",
      { skills, pools, drain, challenge, magicDice, base, baseLabel,
        label: label || skill?.name || "Action",
        sooth: board.value,
        soothText: board.value ? sooth.signed(board.value) : "",
        soothSources: board.sources.join(", ") });

    const result = await DialogV2.wait({
      window: { title: `Venture — ${label || skill?.name || actor.name}` },
      content,
      buttons: [
        { action: "roll", label: "Roll", default: true, icon: "fa-solid fa-dice",
          callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
      ],
      render: (event, dialog) => this.#live(dialog.element, board.value + base, skills, drain),
      rejectClose: false
    });

    if (!result || result === "cancel") return null;
    return this.#roll(actor, skills, pools, result,
      { value: board.value + base, sources: base ? [...board.sources, baseLabel] : board.sources },
      practice, drain);
  }

  /**
   * Every pool a bene or enhancement could come from.
   *
   * With a pool declared, only the enhancement pools survive: see the header on
   * why a magical practice is not offered bene.
   */
  static #poolsOf(actor, declared = "") {
    const out = [];
    for (const stat of ["certes", "qualia"]) {
      const group = actor.system.stats?.[stat]?.pools ?? {};
      for (const [key, pool] of Object.entries(group)) {
        if (declared && key !== "sortilege") continue;
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

  /**
   * What the declared pool takes off the venture before anything is chosen.
   *
   * The vex here is what the pool *holds*, which is the ceiling on the spinner
   * rather than an amount — the GM decides how much of it to call in, so it
   * starts at nothing and is typed up. A scourge has no such choice attached
   * and is simply reported.
   *
   * Null when the action names no pool, which is every skill roll.
   */
  static #drainOf(actor, declared) {
    const found = poolRules.find(actor, declared);
    if (!found) return null;

    const held = found.pool.vex ?? 0;
    const scourge = found.pool.scourgeTotal ?? 0;
    if (!held && !scourge) return null;   // nothing to say, so no row

    return {
      key: found.key,
      path: found.path,
      label: game.i18n.localize(CONFIG.ISUN.poolLabels[found.key] ?? found.key),
      scourge,
      vex: held
    };
  }

  /** Keep the running venture and target honest as the form is filled in. */
  static #live(root, sooth = 0, skills = [], drain = null) {
    /* The skills are a multi-select, so what is chosen is a list of ids rather
     * than a set of ticked boxes, and the level has to be looked up. Built once
     * here rather than read off the options, which core rebuilds into its own
     * markup as the element upgrades. */
    const levelOf = new Map(skills.map(s => [s.id, s.level]));
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
      let venture = sooth - (drain?.scourge ?? 0);
      const picked = root.querySelector('multi-select[name="skills"]')?.value ?? [];
      for (const id of picked) venture += levelOf.get(id) ?? 0;
      for (const el of root.querySelectorAll("input.bene-spend")) {
        venture += spendOf(el);
      }
      venture += Number(root.querySelector('[name="modifier"]')?.value) || 0;
      // Vex comes off, so it is subtracted rather than added — but it is
      // clamped by the same rule as a spend, because it is one.
      const vexEl = root.querySelector('input[name="vexSpend"]');
      if (vexEl) venture -= spendOf(vexEl);

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

    /* multi-select as well as its inner select. The element rebuilds itself
     * into a tag list and a plain <select>, and taking a tag off again fires
     * change on the host rather than on that select — so listening only to
     * what is inside catches skills being added and not removed. */
    root.querySelectorAll("input, select, multi-select").forEach(el => {
      el.addEventListener("change", recalc);
      el.addEventListener("input", recalc);
    });
    recalc();
  }

  /** Deduct what was spent, then roll. */
  static async #roll(actor, skills, pools, form, board = { value: 0, sources: [] },
                     practice = null, drain = null) {
    let venture = (Number(form.modifier) || 0) + board.value;
    const used = [...board.sources];

    /* One name for a single pick, an array for several, and absent for none —
     * so it is normalised before it is walked rather than trusted to be a
     * list. */
    const picked = new Set([form.skills ?? []].flat().filter(Boolean));
    for (const s of skills) {
      if (!picked.has(s.id)) continue;
      venture += s.level;
      used.push(`${s.name} +${s.level}`);
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
    /* The declared pool's own two. Applied after the spends so that the card
     * reads in the order the table argues about it: what you brought, then what
     * the pool took back.
     *
     * The vex is re-clamped against what the pool holds now rather than trusting
     * the form, and cleared from the pool as it is spent — a vex applied twice
     * would be a vex the character never had. */
    if (drain) {
      if (drain.scourge) {
        venture -= drain.scourge;
        used.push(`${game.i18n.localize("ISUN.Scourge")} \u2212${drain.scourge}`);
      }
      /* Re-read rather than trusting what the dialog opened with. A vex is the
       * GM's to place and they may have placed one — or taken one back — while
       * this sat open, and subtracting from a stale count either wipes a vex
       * that was just added or spends one that is no longer there. */
      const held = poolRules.find(actor, drain.key)?.pool?.vex ?? 0;
      const asked = Math.max(0, Math.round(Number(form.vexSpend) || 0));
      const vex = Math.min(asked, held);
      if (vex) {
        venture -= vex;
        updates[`${drain.path}.vex`] = held - vex;
        used.push(`${game.i18n.localize("ISUN.Vex")} \u2212${vex}`);
      }
    }

    if (Object.keys(updates).length) await actor.update(updates);

    return rollVenture({
      challenge: Number(form.challenge) || 0,
      venture,
      magicDice: dice,
      label: form.label || "Action",
      actor,
      practice,
      sources: used
    });
  }
}
