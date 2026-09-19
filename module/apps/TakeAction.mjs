/**
 * Invisible Sun — taking your action without leaving the canvas
 *
 * A round from a player's side is two moves: take the floor when you have
 * something to do, and say you are done. Both are on the tracker, which means
 * both are on the sidebar tab you are not looking at while you play. This is
 * the same two moves under one press.
 *
 * It is one control rather than two because there is never a moment when both
 * are available: either you are holding the floor or you are not. Pressing it
 * takes the floor; pressing it again is Done. Anything else it cannot do, it
 * says out loud rather than failing quietly — a control that sometimes does
 * nothing is worse than one that refuses.
 *
 * ── Why this is not in a compendium ──
 * It should have been. A Macro compendium is how a system ships a ready-made
 * macro, and the whole of this would be one document to drag onto the bar.
 *
 * It cannot be, here. `packs/` is gitignored and `scripts/dist.mjs` forbids
 * `^packs/` outright, both for the same reason: the compendia hold Monte Cook
 * Games' text read out of books somebody bought, and the release archive
 * declares its compendia while carrying none of their contents. A macro is our
 * own writing and would be safe to ship, but it would have to be carved out of
 * three deliberate protections — the ignore, the dist allowlist, and data.mjs's
 * model where the importer is the only thing that ever writes a pack.
 *
 * So the behaviour ships as code, which git and the archive both carry
 * happily, and the Macro document is made in the world on demand. What the
 * player ends up with is the same thing a compendium would have given them: an
 * ordinary macro on their bar, theirs to move, edit or throw away.
 */
import { nextAction } from "../helpers/action-round.mjs";

const SCOPE = "invisible-sun";

export class TakeAction {

  /* ──────────────────────────────────────────────
   * Whose action it is
   * ────────────────────────────────────────────── */

  /**
   * The combatant this press is for.
   *
   * A controlled token first, because selecting something is the clearest way
   * a person says "this one" — and a GM running four creatures means it every
   * time. Then the character the user is assigned, which is what a player has
   * when they have clicked nothing. Then the only one they own, if there is
   * exactly one: with no ambiguity there is nothing to ask about.
   */
  static combatantFor(combat, user = game.user) {
    if (!combat) return null;

    for (const token of canvas?.tokens?.controlled ?? []) {
      const found = combat.combatants.find(c => c.tokenId === token.id);
      if (found) return found;
    }

    const assigned = user.character
      ? combat.combatants.find(c => c.actorId === user.character.id) : null;
    if (assigned) return assigned;

    const owned = combat.combatants.filter(c => c.actor?.testUserPermission(user, "OWNER"));
    return owned.length === 1 ? owned[0] : null;
  }

  /* ──────────────────────────────────────────────
   * The press
   * ────────────────────────────────────────────── */

  /**
   * Take the floor, or give it up if you are holding it.
   *
   * Returns what the press meant, refusals included — "wait", "acted" and
   * "defeated" are answers rather than failures, and a caller that wanted to
   * know which one it was should not have to read the notification. Null is
   * kept for the two cases where there is no action to speak of: no round
   * running, and nothing selected to act with.
   *
   * @returns {Promise<string|null>} what it did, as `nextAction` names it
   */
  static async run() {
    const warn = (key, data) =>
      ui.notifications?.warn(data ? game.i18n.format(key, data) : game.i18n.localize(key));

    const combat = game.combat;
    if (!combat?.started) {
      warn("ISUN.TakeActionNoRound");
      return null;
    }

    const combatant = this.combatantFor(combat);
    if (!combatant) {
      warn("ISUN.TakeActionNobody");
      return null;
    }

    const row = combat.rows.find(r => r.id === combatant.id);
    const what = nextAction(row, combat.round, combat.combatant?.id ?? null);

    switch (what) {
      case "take":
        await combat.takeFloor(combatant.id);
        ui.notifications?.info(game.i18n.format("ISUN.TakeActionTook", { name: combatant.name }));
        return what;
      case "finish":
        await combat.finishTurn(combatant.id);
        ui.notifications?.info(game.i18n.format("ISUN.TakeActionDone", { name: combatant.name }));
        return what;
      case "wait":
        warn("ISUN.TakeActionHeld", { name: combat.combatant.name });
        return what;
      case "acted":
        warn("ISUN.TakeActionAlready", { name: combatant.name });
        return what;
      case "defeated":
        warn("ISUN.TakeActionDefeated", { name: combatant.name });
        return what;
      default:
        warn("ISUN.TakeActionNobody");
        return null;
    }
  }

  /* ──────────────────────────────────────────────
   * Putting it on the bar
   * ────────────────────────────────────────────── */

  /** The one line a macro needs. Written out so a player can read and edit it. */
  static get command() {
    return "game.invisibleSun.takeAction();";
  }

  /**
   * Is it already on this user's bar?
   *
   * What the scene-control button hangs its visibility on: an offer to put
   * something somewhere it already is, is not an offer. Read off the bar rather
   * than off a flag, so a macro the player dragged away, replaced or deleted
   * brings the offer back without anything having to notice it went.
   */
  static get onHotbar() {
    const bar = game.user?.hotbar ?? {};
    return Object.values(bar).some(id => game.macros?.get(id)?.command === this.command);
  }

  /**
   * Keep the button in step with the bar.
   *
   * The scene controls are built once and asked for `visible` as they are, so
   * without this the button lingers until something else happens to rebuild
   * them — and a button that does nothing is the thing this change was made to
   * get rid of.
   */
  static listen() {
    Hooks.on("updateUser", (user, changed) => {
      if (user.id === game.user.id && "hotbar" in changed) this.refreshControls();
    });

    /* Deleting the macro leaves the slot holding an id that resolves to
     * nothing, and writes no user — so the bar never changes and the hook
     * above never fires. `onHotbar` reads this correctly as "not there"; this
     * is what makes anything ask it again. */
    Hooks.on("deleteMacro", (macro) => {
      if (macro.command === this.command) this.refreshControls();
    });
  }

  /**
   * Rebuild the scene controls, tools and all.
   *
   * `reset` is the whole of it: SceneControls keeps the prepared control set
   * and only calls getSceneControlButtons again when asked to, so a plain
   * render redraws the same tools it already had and the button stays put.
   */
  static refreshControls() {
    ui.controls?.render({ reset: true });
  }

  /**
   * Make the macro if it is not already made, and put it on the hotbar.
   *
   * Reused by command rather than by name, the way an item macro is, so a
   * second press does not make a second macro. Nor does it take a second slot:
   * a button pressed twice means the person did not see it work the first
   * time, and the useful answer is where it already is rather than another
   * copy of it further along the bar. That is the difference between this and
   * an item dragged onto the bar — a drag names the slot, so the same skill in
   * two slots is a thing somebody asked for; this names none.
   *
   * An explicit slot is honoured either way, because passing one is asking.
   * Otherwise it is the first free slot: which slot is a question with no
   * interesting answer.
   */
  static async toHotbar(slot = null) {
    if (!game.user.can("MACRO_SCRIPT")) {
      ui.notifications?.warn(game.i18n.localize("ISUN.MacroNoCreate"));
      return null;
    }

    const existing = game.macros.find(m => m.command === this.command && m.author === game.user);
    const macro = existing ?? await Macro.create({
      name: game.i18n.localize("ISUN.TakeAction"),
      type: "script",
      img: "icons/svg/combat.svg",
      command: this.command,
      flags: { [SCOPE]: { takeAction: true } }
    }, { renderSheet: false });
    if (!macro) return null;

    const already = this.#slotOf(macro);
    if (already && slot === null) {
      ui.notifications?.info(
        game.i18n.format("ISUN.TakeActionAlreadyOnBar", { slot: already }));
      return macro;
    }

    const where = slot ?? this.#firstFreeSlot();
    if (where === null) {
      ui.notifications?.warn(game.i18n.localize("ISUN.TakeActionBarFull"));
      return macro;
    }

    await game.user.assignHotbarMacro(macro, where);
    ui.notifications?.info(game.i18n.format("ISUN.TakeActionOnBar", { slot: where }));
    /* Belt as well as the updateUser brace: assignHotbarMacro writes the user,
     * so the hook fires too, but the button going the instant it is pressed is
     * what makes the press feel like it landed. */
    this.refreshControls();
    return macro;
  }

  /** Which slot this macro is already in, or null if it is on none of them. */
  static #slotOf(macro) {
    const bar = game.user.hotbar ?? {};
    for (const [slot, id] of Object.entries(bar)) if (id === macro.id) return Number(slot);
    return null;
  }

  /** The first empty slot across all five pages, or null if there is none. */
  static #firstFreeSlot() {
    const bar = game.user.hotbar ?? {};
    for (let slot = 1; slot <= 50; slot++) if (!bar[slot]) return slot;
    return null;
  }
}
