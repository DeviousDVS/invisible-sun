import { SkillPicker } from "./SkillPicker.mjs";
import { SpendPips } from "./SpendPips.mjs";
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

    /* What one action may be paid with, across every pool the dialog offers —
     * one bene unless a secret raises it. See helpers/pools.mjs. */
    const cap = poolRules.beneCap(actor);
    /* Sortilege answers to its own rule, and to what is being aided. "Something
     * that already has enhancements, like a spell" is not every practice — it
     * is one actually carrying dice. A spell that grants none has nothing to
     * stack onto, and Sortilege may aid it like any other action.
     *
     * Both answers are worked out here and chosen between as the dialog is
     * used, because the magic dice are a field the player can still change:
     * declining a conditional die should give Sortilege back, and adding one
     * should take it away.
     */
    const sortWhenPlain = poolRules.sortilegeCap(actor, { enhanced: false });
    const sortWhenEnhanced = poolRules.sortilegeCap(actor, { enhanced: true });
    /* Drawn for the most that could ever be allowed; the live ceiling dims what
     * is not allowed now, which is how a row says "not onto this" rather than
     * disappearing. */
    const sortCap = Math.max(sortWhenPlain, sortWhenEnhanced);
    const pools = this.#poolsOf(actor, pool, cap, sortCap);
    const drain = this.#drainOf(actor, pool);
    // Read once, and carried to the roll: see ChallengeResponse on why the
    // board is not read again as the dice land.
    const board = await sooth.ventureFor(actor);

    const { renderTemplate } = foundry.applications.handlebars;
    const content = await renderTemplate(
      "systems/invisible-sun/templates/apps/venture-dialog.hbs",
      { skills, pools, drain, challenge, magicDice, base, baseLabel,
        beneHint: game.i18n.format("ISUN.BeneCapHint", { cap }),
        sortilegeHint: game.i18n.format("ISUN.SortilegeCapHint",
          { cap: sortWhenPlain, onEnhanced: sortWhenEnhanced }),
        label: label || skill?.name || "Action",
        sooth: board.value,
        soothText: board.value ? sooth.signed(board.value) : "",
        soothSources: board.sources.join(", ") });

    const result = await DialogV2.wait({
      window: { title: `Venture — ${label || skill?.name || actor.name}` },
      classes: ["invisible-sun", "venture-dialog-app"],
      content,
      buttons: [
        { action: "roll", label: "Roll", default: true, icon: "fa-solid fa-dice",
          callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
      ],
      render: (event, dialog) => {
        const el = dialog.element;
        SkillPicker.wire(el, skills);
        SpendPips.wire(el, ".bene-pips", cap);
        /* Read as the dice stand, not as they stood when this opened. */
        const enhancedNow = () =>
          (Number(el.querySelector('[name="magicDice"]')?.value) || 0) > 0;
        const sortilege = SpendPips.wire(el, ".enh-pips",
          () => (enhancedNow() ? sortWhenEnhanced : sortWhenPlain));
        this.#live(el, board.value + base, skills, drain, sortilege);
      },
      rejectClose: false
    });

    if (!result || result === "cancel") return null;
    return this.#roll(actor, skills, pools, result,
      { value: board.value + base, sources: base ? [...board.sources, baseLabel] : board.sources },
      practice, drain, { bene: cap, sortPlain: sortWhenPlain, sortEnhanced: sortWhenEnhanced });
  }

  /**
   * Every pool a bene or enhancement could come from.
   *
   * With a pool declared, only the enhancement pools survive: see the header on
   * why a magical practice is not offered bene.
   */
  static #poolsOf(actor, declared = "", cap = Infinity, sortCap = Infinity) {
    const out = [];
    for (const stat of ["certes", "qualia"]) {
      const group = actor.system.stats?.[stat]?.pools ?? {};
      for (const [key, pool] of Object.entries(group)) {
        if (declared && key !== "sortilege") continue;
        out.push({
          path: `system.stats.${stat}.pools.${key}.value`,
          key, stat,
          /* How many pips to draw: what is held, or what the action may carry.
           * Drawing the smaller of the two is what makes the cap visible. */
          spendable: Math.min(pool.value ?? 0, key === "sortilege" ? sortCap : cap),
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
  static #live(root, sooth = 0, skills = [], drain = null, sortilege = null) {
    /* What is chosen is a row per skill carrying its id, so the level has to
     * be looked up. Built once here rather than read off the rows, so the
     * number that reaches the venture is the one the actor has and not one the
     * markup could be stale about. */
    const levelOf = new Map(skills.map(s => [s.id, s.level]));
    /* A browser does not enforce `max` on a typed value, so a spend is clamped
     * here as well as when it is applied. Without this the preview promises a
     * venture the roll will not honour, because the pool has not got the bene.
     *
     * hasAttribute rather than Number(el.max): an element carrying no max reads
     * as "", and Number("") is 0, which is finite — so an absent ceiling
     * clamped every spend to nothing. That went unnoticed while every spend was
     * a number field with a max on it, and bit the moment the bene rows became
     * pips keeping their count on a plain hidden input. Each click set a value
     * and this wrote a 0 straight back over it. */
    const spendOf = (el) => {
      const max = el.hasAttribute("max") ? Number(el.max) : Infinity;
      let v = Math.max(0, Math.round(Number(el.value) || 0));
      if (Number.isFinite(max)) v = Math.min(v, max);
      if (String(v) !== el.value) el.value = v;
      return v;
    };

    const recalc = () => {
      let venture = sooth - (drain?.scourge ?? 0);
      for (const el of root.querySelectorAll('.skill-pick input[name="skills"]')) {
        venture += levelOf.get(el.value) ?? 0;
      }
      for (const el of root.querySelectorAll("input.bene-spend")) {
        venture += spendOf(el);
      }
      venture += Number(root.querySelector('[name="modifier"]')?.value) || 0;
      // Vex comes off, so it is subtracted rather than added — but it is
      // clamped by the same rule as a spend, because it is one.
      const vexEl = root.querySelector('input[name="vexSpend"]');
      if (vexEl) venture -= spendOf(vexEl);

      /* The magic dice decide what Sortilege may add, so the pips are redrawn
       * before they are counted — an enhancement the action may no longer carry
       * is given back here rather than reaching the roll. */
      sortilege?.refresh();

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

    /* Listened for on the dialog rather than on each field. The skill rows are
     * built after this runs and rebuilt every time one is added or taken off,
     * so a listener bound to the fields themselves would be bound to elements
     * that no longer exist. Both events, because a typed number reports
     * `input` as it is typed and a click reports `change`. */
    root.addEventListener("change", recalc);
    root.addEventListener("input", recalc);
    recalc();
  }

  /** Deduct what was spent, then roll. */
  static async #roll(actor, skills, pools, form, board = { value: 0, sources: [] },
                     practice = null, drain = null,
                     caps = { bene: Infinity, sortPlain: Infinity, sortEnhanced: Infinity }) {
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
    /* The cap again, on the way out. The pips enforce it as they are clicked,
     * and a form that reached here saying otherwise should still not be paid —
     * the same reason every spend is clamped against the pool as well. */
    let budget = caps.bene;
    /* Read off the form rather than off what the dialog opened with: the magic
     * dice are the player's to change, and what Sortilege may add follows them.
     * The pips enforce this as they are clicked; a form arriving here saying
     * otherwise should still not be paid. */
    const sortLimit = (Number(form.magicDice) || 0) > 0 ? caps.sortEnhanced : caps.sortPlain;
    for (const p of pools) {
      let spend = Math.max(0, Math.min(Number(form[`pool.${p.key}`]) || 0, p.value));
      if (p.isEnhancement) spend = Math.min(spend, sortLimit);
      else {
        spend = Math.min(spend, budget);
        budget -= spend;
      }
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
