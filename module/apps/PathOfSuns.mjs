import { ISUN } from "../helpers/config.mjs";
import * as sooth from "../helpers/sooth.mjs";

/**
 * Invisible Sun — the Path of Suns board
 *
 * "The Path of Suns board needs to have a prominent place at your game table.
 * Play the Sooth cards right on each sun. When a card is played on the Invisible
 * Sun, place it in the Testament of Suns, because that card's effects will be
 * active for a while, so it should be visible for all to see" (The Gate, p71).
 *
 * That is the whole brief: a board everyone can see, showing which card is
 * where and what it is currently doing to the table's magic. It applies
 * nothing. Nobody's roll changes because of what this window says — the
 * modifiers are read off it and used by hand, exactly as they are at a physical
 * table, and the numbers it shows come from helpers/sooth.mjs, which the roll
 * dialogs can read later without any of this being rewritten.
 *
 * Leaving it advisory is also what the book asks for: "The Sooth Deck is a
 * tool, not an obligation. You'll likely forget to turn a new card when you
 * should, or forget to apply a modifier from time to time. Don't worry about
 * it" (The Gate, p73). A window that silently rewrote everyone's dice would
 * make forgetting impossible and disagreeing hard.
 *
 * ── Who may do what ──
 * The board is a world setting, so only a GM can write it and every client can
 * read it. The controls are drawn for a GM alone; a player's window is the same
 * board without them, updating as cards are turned.
 */
const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

const SCOPE = "invisible-sun";

export class PathOfSuns extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "isun-path-of-suns",
    classes: ["invisible-sun", "path-of-suns"],
    tag: "div",
    position: { width: 860, height: "auto" },
    window: { title: "ISUN.PathTitle", resizable: true, icon: "fa-solid fa-sun" },
    actions: {
      turnCard: PathOfSuns.#onTurnCard,
      placeCard: PathOfSuns.#onPlaceCard,
      openCard: PathOfSuns.#onOpenCard,
      undoTurn: PathOfSuns.#onUndoTurn,
      newSession: PathOfSuns.#onNewSession,
      reshuffle: PathOfSuns.#onReshuffle,
      toggleNightside: PathOfSuns.#onToggleNightside
    }
  };

  static PARTS = {
    board: { template: "systems/invisible-sun/templates/apps/path-of-suns.hbs" }
  };

  /** Open the board, or bring the open one forward. */
  static open() {
    const existing = foundry.applications.instances.get(this.DEFAULT_OPTIONS.id);
    if (existing) return existing.bringToFront();
    return new this().render(true);
  }

  /**
   * Keep every open board in step with the world's.
   *
   * A world setting is a Setting document, so a GM writing it reaches the other
   * clients as an update like any other. Without this a player's board is
   * whatever it was when they opened it.
   */
  static listen() {
    Hooks.on("updateSetting", (setting) => {
      if (setting.key !== `${SCOPE}.${sooth.SETTING}`) return;
      for (const app of foundry.applications.instances.values()) {
        if (app instanceof PathOfSuns) app.render(false);
      }
    });
  }

  /* ──────────────────────────────────────────────
   * What the board shows
   * ────────────────────────────────────────────── */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const state = sooth.read();
    const deck = await sooth.deck();
    const cards = sooth.lookup(deck, state);

    const slots = sooth.slots(state);
    const active = sooth.active(state);
    const next = sooth.nextSun(state);
    const effects = sooth.effects(state, cards);

    return Object.assign(context, {
      isGM: game.user.isGM,
      nightside: state.nightside,
      empty: !deck.length,
      remaining: sooth.remaining(state, deck).length,
      played: state.history.filter(e => !e.kept).length,
      positions: sooth.board(state).map(sun => this.#position(sun, slots, cards, active, next)),
      suns: this.#sunLines(effects),
      actions: this.#actionLines(effects),
      table: this.#table(state, cards)
    });
  }

  /** One place on the Path, with whatever is sitting on it. */
  #position(sun, slots, cards, active, next) {
    const entry = slots.get(sun) ?? null;
    const card = entry ? cards.get(entry.uuid) : null;

    return {
      sun,
      label: game.i18n.localize(ISUN.suns[sun].label),
      colour: ISUN.suns[sun].color,
      offPath: Boolean(ISUN.suns[sun].offPath),
      next: sun === next,
      /* The card held over from a previous session is in play, but it is not
       * the card that was just turned — nothing has been, yet. Calling it
       * active would say a turn happened that did not. */
      active: Boolean(entry && entry === active && !entry.kept),
      testament: sun === "invisible" && Boolean(entry),
      card: card && {
        uuid: entry.uuid,
        name: card.name,
        img: card.img,
        value: card.value,
        family: card.family ? game.i18n.localize(ISUN.soothFamilies[card.family]) : "",
        rank: card.rank ? game.i18n.localize(ISUN.soothRanks[card.rank]) : "",
        effectText: card.effectText,
        // The card whose sun matches the sun it sits on works twice as hard,
        // and that is the thing a reader most needs to spot on the board.
        doubled: [card.enhancedSun, card.diminishedSun]
          .some(s => String(s ?? "").toLowerCase() === sun)
      },
      missing: Boolean(entry && !card)
    };
  }

  /** "Blue spells: level +2 or Sorcery −2 (doubled)". */
  #sunLines(effects) {
    return effects.suns.map(s => ({
      sun: s.sun,
      colour: ISUN.suns[s.sun]?.color ?? "#888",
      doubled: s.doubled,
      source: s.source,
      text: game.i18n.format(s.amount > 0 ? "ISUN.PathSunEnhanced" : "ISUN.PathSunDiminished", {
        sun: game.i18n.localize(ISUN.suns[s.sun]?.label ?? s.sun),
        amount: Math.abs(s.amount)
      })
    }));
  }

  /** The venture modifiers, each kept beside the card it came from. */
  #actionLines(effects) {
    return effects.actions.map(a => ({
      source: a.source,
      rank: a.rank ? game.i18n.localize(ISUN.soothRanks[a.rank]) : "",
      family: a.family ? game.i18n.localize(ISUN.soothFamilies[a.family]) : "",
      all: a.value ? this.constructor.signed(a.value) : "",
      matched: a.familyValue ? this.constructor.signed(a.familyValue) : ""
    }));
  }

  /**
   * The characters at the table and what the board is doing to each.
   *
   * The party is every vislae a player owns, rather than the actors assigned to
   * user accounts: a table where two characters are shared, or where somebody
   * plays a second, still has them all owned, and an actor nobody owns is the
   * GM's own and not part of the reading.
   *
   * A heart's family is what links a character to a card, and the heart is an
   * item they carry rather than a field on the sheet, so it is read from their
   * items. Anyone without a heart yet simply is not listed — there is nothing
   * to say about them until they have one.
   */
  #table(state, cards) {
    const rows = [];

    for (const actor of game.actors) {
      if (actor.type !== "Vislae" || !actor.hasPlayerOwner) continue;

      const heart = actor.items.find(i => i.type === "Heart");
      const family = heart?.system?.cardFamily ?? "";
      if (!family) continue;

      const { venture, sources } = sooth.modifiersFor(family, state, cards);
      rows.push({
        name: actor.name,
        heart: heart.name,
        family,
        venture: venture ? this.constructor.signed(venture) : "",
        sources: sources.map(s => `${s.text} ${this.constructor.signed(s.value)}`).join(", ")
      });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** +1 rather than 1, and −1 with the character the books print. */
  static signed(value) {
    return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
  }

  /* ──────────────────────────────────────────────
   * Playing
   * ────────────────────────────────────────────── */

  /** Turn the next card, and anything an Adept or Companion drags after it. */
  static async #onTurnCard() {
    const state = sooth.read();
    const deck = await sooth.deck();

    if (!deck.length) {
      ui.notifications?.warn(game.i18n.localize("ISUN.PathNoDeck"));
      return;
    }
    const { state: turned, placed } = sooth.turn(state, deck);
    if (!placed.length) {
      ui.notifications?.warn(game.i18n.localize("ISUN.PathDeckSpent"));
      return;
    }
    await sooth.write(turned);
    this.render();
  }

  /**
   * Put a named card on a chosen sun.
   *
   * For the table playing with the cards in their hands: the deck on the table
   * is the real one, and this is how what it did gets onto the board. It is
   * also how a mistake is corrected without unwinding the session.
   */
  static async #onPlaceCard(event, target) {
    const sun = target.dataset.sun;
    const state = sooth.read();
    const deck = await sooth.deck();
    const left = sooth.remaining(state, deck).sort((a, b) => a.name.localeCompare(b.name));

    if (!left.length) {
      ui.notifications?.warn(game.i18n.localize("ISUN.PathDeckSpent"));
      return;
    }

    const options = left.map(c => `<option value="${c.uuid}">${c.name}</option>`).join("");
    const chosen = await DialogV2.prompt({
      window: { title: game.i18n.format("ISUN.PathPlaceOn", {
        sun: game.i18n.localize(ISUN.suns[sun].label) }) },
      content: `<select name="uuid" style="width:100%">${options}</select>`,
      ok: {
        label: game.i18n.localize("ISUN.PathPlace"),
        callback: (ev, button) => button.form.elements.uuid.value
      },
      rejectClose: false
    });
    if (!chosen) return;

    const card = left.find(c => c.uuid === chosen);
    await sooth.write(sooth.place(state, card, sun));
    this.render();
  }

  /** The write-up behind a card is its item sheet, so open that. */
  static async #onOpenCard(event, target) {
    const card = await fromUuid(target.dataset.uuid);
    card?.sheet?.render(true);
  }

  static async #onUndoTurn() {
    await sooth.write(sooth.undo(sooth.read()));
    this.render();
  }

  static async #onNewSession() {
    await sooth.write(sooth.newSession(sooth.read()));
    this.render();
  }

  static async #onReshuffle() {
    await sooth.write(sooth.reshuffle(sooth.read()));
    this.render();
  }

  /** "Nightside Path: The Path of Suns in reverse" (The Gate, p10956). */
  static async #onToggleNightside() {
    const state = sooth.read();
    await sooth.write({ ...state, nightside: !state.nightside });
    this.render();
  }
}
