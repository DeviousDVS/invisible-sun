/**
 * Invisible Sun — using what a character holds
 *
 * Rolling a skill and casting a spell were methods on the vislae sheet, which
 * was right while the sheet was the only way to reach them. It is not any more:
 * a skill or a practice dropped on the hotbar is a second way in, and a macro
 * has no sheet to be a method on.
 *
 * So the doing lives here and the sheet calls it, the way the macro does. None
 * of the flow below changed on the way out of the sheet — it is the same code,
 * with the three lines that reached for `this.document` and a clicked row
 * taking an actor and an item as arguments instead.
 *
 * ── Why an app and not a document ──
 * It asks questions. The venture dialog, the retain prompt and the depletion
 * board are all applications, and a document may not reach one — so this sits
 * where they do rather than on ISUNItem, which is the layer below.
 */
const { DialogV2 } = foundry.applications.api;

import { VentureDialog } from "./VentureDialog.mjs";
import { DepletionTracker } from "./DepletionTracker.mjs";
import { challengeForTargets } from "../helpers/target.mjs";
import * as practiceRules from "../helpers/practice.mjs";

export class UseItem {

  /**
   * Use this item, whatever kind it is.
   *
   * The one entry a macro needs, because a macro is made by dropping a row on
   * the bar and the row does not say which of the two things it is.
   */
  static async run(actor, item) {
    if (!actor || !item) return;
    if (item.type === "Skill") return this.rollSkill(actor, item);
    if (practiceRules.isPractice(item)) return this.usePractice(actor, item);
    ui.notifications?.warn(game.i18n.format("ISUN.MacroNotUsable", { name: item.name }));
  }

  /**
   * Run the item named by a uuid. What a hotbar macro calls.
   *
   * Resolved at the moment it is pressed rather than baked into the macro, so a
   * skill whose level went up is rolled at the level it is now, and one that
   * was deleted says so instead of rolling something stale.
   */
  static async byUuid(uuid) {
    const item = await fromUuid(uuid);
    if (!item?.parent) {
      ui.notifications?.warn(game.i18n.localize("ISUN.MacroNoItem"));
      return;
    }
    if (!item.parent.isOwner) {
      ui.notifications?.warn(game.i18n.format("ISUN.MacroNotYours", { name: item.name }));
      return;
    }
    return this.run(item.parent, item);
  }

  /**
   * Put an item on the hotbar as a macro.
   *
   * The item's own uuid, not its name: a vislae may hold two abilities called
   * the same thing across two fortes, and a macro that found the wrong one
   * would spend the wrong pool.
   *
   * An existing macro with the same command is reused rather than a second one
   * made. Dragging the same skill to two slots is a thing people do, and it
   * should put the same macro in both rather than fill the directory with
   * copies of one line.
   */
  static async toHotbar(item, slot) {
    if (!game.user.can("MACRO_SCRIPT")) {
      ui.notifications?.warn(game.i18n.localize("ISUN.MacroNoCreate"));
      return null;
    }

    const command = `game.invisibleSun.useItem(${JSON.stringify(item.uuid)});`;
    const macro = game.macros.find(m => m.command === command && m.author === game.user)
      ?? await Macro.create({
        name: item.name,
        type: "script",
        img: item.img,
        command,
        flags: { "invisible-sun": { item: item.uuid } }
      }, { renderSheet: false });

    if (!macro) return null;
    await game.user.assignHotbarMacro(macro, slot);
    return macro;
  }

  /**
   * Roll a skill, with the skill already ticked.
   *
   * If the player has targeted something, its level fills the challenge in.
   * "Challenge is often very easy to determine because you can just use the
   * level of the NPC, object, or whatever else is involved" (The Gate, p18) —
   * so the player has already said what the number is by picking a target, and
   * the field is theirs to correct either way.
   */
  static async rollSkill(actor, skill) {
    const found = challengeForTargets();
    return VentureDialog.open(actor, {
      skill, label: skill.name,
      challenge: found?.challenge ?? 0,
      target: found
    });
  }

  /**
   * Use a practice: pay for it, roll for it, and see what it costs to keep.
   *
   * This was a stub that rolled challenge 0 against venture 0 with one magic
   * die and spent nothing, whatever the practice was. What the rules ask for:
   *
   *   the cost    Sorcery equal to the level, "almost always" (The Way, p8),
   *               and nothing at all for a Vancian spell or a forte ability
   *               that says so.
   *   the venture "you always add the level of the effect to the venture" (p7).
   *   the dice    what the card itself grants — "+1 die", "+2 dice" — not one
   *               by default.
   *   the target  "the challenge is the level of the target", or nothing, which
   *               is the commoner case: cast on yourself or on something that
   *               does not object and no roll is needed at all.
   *
   * Refused outright when it cannot be paid for or, for a Vance, is not in
   * mind. Elsewhere this system reports over-limit and lets the table decide,
   * but those are caps on what may be held; this is the price of an act, and a
   * spell a Vance has not prepared is not in their head to cast.
   */
  static async usePractice(doc, item) {
    if (!doc || !item) return;

    const { allowed, reason, cost, pool } = practiceRules.canCast(doc, item);
    if (!allowed) {
      ui.notifications?.warn(game.i18n.format(reason,
        { name: item.name, cost, pool, level: item.system?.level ?? 0 }));
      return;
    }

    const result = await VentureDialog.open(doc, {
      challenge: practiceRules.challengeFor(),
      magicDice: practiceRules.magicDiceOf(item),
      base: item.system?.level ?? 0,
      baseLabel: item.name,
      /* Every magical practice draws on Sorcery, whatever it costs — a Vancian
       * spell and a no-cost forte ability still work the pool, so a scourge on
       * it still bites. Naming it is what lets the dialog reach the scourge and
       * offer the vex. */
      pool: "sorcery",
      label: game.i18n.format("ISUN.UsedItem", { name: item.name }),
      practice: await this.#practiceCard(item, cost)
    });
    if (!result) return;   // cancelled; nothing is spent and nothing is used

    /* Paid after the roll, not before. The dialog can be dismissed, and a
     * practice that was never used should not have been paid for. */
    if (cost) await doc.adjustPool("sorcery", -cost);

    /* Depletion is deliberately not rolled here. It used to be, on the reading
     * that using a thing is when it wears out — but the books say when to check
     * and it is hardly ever the moment of casting. Of 541 entries across the
     * packs: 106 check each round, 49 each use, 25 each hour, 10 each day, and
     * 171 do not roll at all but end on a sunrise, a sunset or a condition.
     * Rolling on the cast was wrong for the great majority and quietly spent
     * things that should still have been in play.
     *
     * So the table decides when, and the Depletion column in the practices
     * table is the control that throws it. See _onRollDepletion. */

    await this.#offerRetain(doc, item);

    /* And onto the board, if there is anything to check. "It is the
     * responsibility of the player to keep track of spells they cast and
     * ongoing effects that require depletion rolls" (The Way, p11) — so the
     * moment it is cast is the moment to record it, rather than asking the
     * player to remember to. Silently skipped for the 176 entries in 541 that
     * end on a sunrise or a condition and are never rolled at all. */
    await DepletionTracker.start(doc, item);
  }

  /**
   * What the chat card says about the practice that was used.
   *
   * The point is the table rather than the caster: everyone can see the roll
   * already, and nobody but the owner can see what the spell actually does. So
   * the effect travels with the roll.
   *
   * Range and duration are not carried. Both fields exist on the model and both
   * are empty on all 1,117 entries across the four packs, so a row for them
   * would be a label with nothing after it.
   *
   * The description is enriched here, where there is an item to enrich it
   * against; chat content is not enriched on the way in.
   */
  static async #practiceCard(item, cost) {
    const { TextEditor } = foundry.applications.ux;
    return {
      name: item.name,
      img: item.img,
      kind: practiceRules.kindLabelFor(item),
      level: item.system?.level ?? 0,
      colour: item.system?.color ?? "",
      cost,
      /* Said only when there was one. A Vancian spell costs nothing to cast and
       * a no-cost forte ability nothing ever, and "0 Sorcery" invites the
       * reader to wonder what went wrong. */
      paid: cost > 0,
      depletion: item.system?.depletion ?? "",
      description: item.system?.description
        ? await TextEditor.implementation.enrichHTML(item.system.description, { relativeTo: item })
        : ""
    };
  }

  /**
   * Ask a Vance whether the spell stays in mind.
   *
   * "To cast a spell is to expel it from your mind and soul (unless you use
   * your personal power to grasp onto it so you can cast it again)" — and that
   * grasp costs "Sorcery equal to the spell's level" (The Key, Vance 1st
   * degree). So the default is that it goes: keeping it is the deliberate act
   * and the one that is paid for.
   *
   * Asked only of a Vancian spell that was prepared, which is the only thing
   * with anything to lose.
   */
  static async #offerRetain(actor, item) {
    if (!practiceRules.isVancian(item) || !item.system.prepared) return;

    const cost = practiceRules.retainCost(item);
    const afford = (actor.system.stats?.qualia?.pools?.sorcery?.value ?? 0) >= cost;

    const keep = await DialogV2.wait({
      window: { title: game.i18n.localize("ISUN.RetainTitle"), icon: "fa-solid fa-brain" },
      classes: ["invisible-sun"],
      content: `<p>${game.i18n.format("ISUN.RetainAsk", { name: item.name, cost })}</p>`
        + (afford ? "" : `<p class="notes">${game.i18n.localize("ISUN.RetainCannotAfford")}</p>`),
      buttons: [
        { action: "keep", default: afford, icon: "fa-solid fa-hand-holding-heart",
          label: game.i18n.format("ISUN.RetainKeep", { cost }),
          disabled: !afford, callback: () => true },
        { action: "release", default: !afford, icon: "fa-solid fa-wind",
          label: game.i18n.localize("ISUN.RetainRelease"), callback: () => false }
      ],
      rejectClose: false
    });

    /* Dismissing the window is not keeping it. The spell leaves unless somebody
     * says otherwise and pays, which is the way round the rule is written. */
    if (keep === true && afford) {
      await actor.adjustPool("sorcery", -cost);
      return;
    }
    await item.update({ "system.prepared": false });
  }
}
