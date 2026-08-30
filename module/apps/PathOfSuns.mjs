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
      suns: PathOfSuns.#sunLines(state, cards),
      actions: PathOfSuns.#actionLines(effects)
    });
  }

  /** One place on the Path, with whatever is sitting on it. */
  #position(sun, slots, cards, active, next) {
    const entry = slots.get(sun) ?? null;
    const card = entry ? cards.get(entry.uuid) : null;

    return {
      sun,
      label: game.i18n.localize(CONFIG.ISUN.suns[sun].label),
      colour: CONFIG.ISUN.suns[sun].color,
      offPath: Boolean(CONFIG.ISUN.suns[sun].offPath),
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
        family: card.family ? game.i18n.localize(CONFIG.ISUN.soothFamilies[card.family]) : "",
        rank: card.rank ? game.i18n.localize(CONFIG.ISUN.soothRanks[card.rank]) : "",
        effectText: card.effectText,
        // The card whose sun matches the sun it sits on works twice as hard,
        // and that is the thing a reader most needs to spot on the board.
        doubled: [card.enhancedSun, card.diminishedSun]
          .some(s => String(s ?? "").toLowerCase() === sun)
      },
      missing: Boolean(entry && !card)
    };
  }

  /**
   * "Blue spells: level +2, or 2 less Sorcery", one line per sun.
   *
   * Totalled in helpers/sooth.mjs rather than here, because the same totals are
   * read by the vislae sheet beside each spell. This puts words to them.
   */
  static #sunLines(state, cards) {
    return [...sooth.sunTotals(state, cards).values()]
      .sort((a, b) => (CONFIG.ISUN.suns[a.sun]?.order ?? 9) - (CONFIG.ISUN.suns[b.sun]?.order ?? 9))
      .map(s => ({
        sun: s.sun,
        colour: CONFIG.ISUN.suns[s.sun]?.color ?? "#888",
        doubled: s.doubled,
        names: [...s.sources.keys()],
        source: sooth.sourceList(s.sources),
        text: game.i18n.format(s.amount > 0 ? "ISUN.PathSunEnhanced" : "ISUN.PathSunDiminished", {
          sun: game.i18n.localize(CONFIG.ISUN.suns[s.sun]?.label ?? s.sun),
          amount: Math.abs(s.amount)
        })
      }));
  }

  /**
   * The venture modifiers, each kept beside the card it came from.
   *
   * Not totalled the way the suns are: these have two scopes at once — a number
   * for everybody and a larger one for a linked heart — so a single figure
   * would have to pick a character to be about. The party table below does that
   * per character. What is totalled here is the one line arriving twice, from a
   * Companion duplicating a card that is still in play on its own account.
   */
  static #actionLines(effects) {
    const merged = new Map();

    for (const a of effects.actions) {
      const key = `${a.source}\u0000${a.rank}\u0000${a.family}`;
      const at = merged.get(key) ?? { ...a, value: 0, familyValue: 0 };
      at.value += a.value;
      at.familyValue += a.familyValue;
      merged.set(key, at);
    }

    return [...merged.values()].map(a => ({
      source: a.source,
      names: [a.source],
      rank: a.rank ? game.i18n.localize(CONFIG.ISUN.soothRanks[a.rank]) : "",
      family: a.family ? game.i18n.localize(CONFIG.ISUN.soothFamilies[a.family]) : "",
      all: a.value ? sooth.signed(a.value) : "",
      matched: a.familyValue ? sooth.signed(a.familyValue) : ""
    }));
  }

  /* ──────────────────────────────────────────────
   * Saying so
   * ────────────────────────────────────────────── */

  /**
   * Announce a card turn in chat.
   *
   * The board is a window, and a window is only seen by whoever has it open.
   * The turn itself is an event at the table — "a new card is played at the
   * GM's discretion, but the following things should probably always trigger a
   * card turn: characters move to a new location, a significant event occurs…"
   * (The Gate, p73) — so it belongs in the log beside the rolls it is about to
   * modify, where it can be scrolled back to.
   *
   * The card's own write-up is fetched here rather than carried on the board.
   * The board reads the pack's index, which holds the picture and the rules and
   * not the prose; the prose is wanted once, at the moment the card is turned.
   *
   * The effects are the whole board's, not this card's: the Testament is still
   * in play under it, and what a player needs is the total.
   */
  static async #announce(state, placed, cards) {
    if (!placed.length) return;

    const { renderTemplate } = foundry.applications.handlebars;
    const { TextEditor } = foundry.applications.ux;
    const effects = sooth.effects(state, cards);
    const turns = [];

    for (const [i, { card, sun }] of placed.entries()) {
      const doc = await fromUuid(card.uuid).catch(() => null);
      const description = doc?.system?.description
        ? await TextEditor.implementation.enrichHTML(doc.system.description, { relativeTo: doc })
        : "";

      turns.push({
        sun,
        sunLabel: game.i18n.localize(CONFIG.ISUN.suns[sun].label),
        colour: CONFIG.ISUN.suns[sun].color,
        uuid: card.uuid,
        name: card.name,
        img: card.img,
        value: card.value,
        family: card.family ? game.i18n.localize(CONFIG.ISUN.soothFamilies[card.family]) : "",
        rank: card.rank ? game.i18n.localize(CONFIG.ISUN.soothRanks[card.rank]) : "",
        // A royalty card's whole effect is its printed text, and it shifts no
        // sun, so without this the card would arrive saying nothing.
        effectText: card.effectText,
        meanings: doc?.system?.meanings ?? "",
        description,
        doubled: [card.enhancedSun, card.diminishedSun]
          .some(s => String(s ?? "").toLowerCase() === sun),
        // An Adept or a Companion turns the next card itself, so a turn can
        // arrive as two. Only the last of them is the active card.
        superseded: i < placed.length - 1
      });
    }

    /* The card just turned is named at the top of the message, so naming it
     * again beside each of its own effects is three repetitions of one word.
     * What is worth attributing is an effect from somewhere else — the card in
     * the Testament, still in play under this one. */
    const named = new Set(placed.map(p => p.card.name));
    const attribute = (line) => ({
      ...line, source: line.names.every(n => named.has(n)) ? "" : line.source
    });

    await ChatMessage.create({
      speaker: { alias: game.i18n.localize("ISUN.PathTitle") },
      content: await renderTemplate("systems/invisible-sun/templates/chat/sooth-turn.hbs", {
        turns,
        suns: PathOfSuns.#sunLines(state, cards).map(attribute),
        actions: PathOfSuns.#actionLines(effects).map(attribute)
      })
    });
  }

  /* ──────────────────────────────────────────────
   * Playing
   * ────────────────────────────────────────────── */

  /** Turn the next card, and anything an Adept or Companion drags after it. */
  /**
   * Turn the next card, wherever the instruction came from.
   *
   * Separate from the button because the board is no longer the only thing that
   * turns a card: a magical flux "immediately turns a new Sooth card" (The Way,
   * p13), and that happens whether or not anyone has the board open. The Gate
   * lists the same prompt from the other side, among the things that "probably
   * should trigger a card turn" (p7).
   *
   * Writing the board is a world setting, so only a GM can do it; a player
   * calling this gets `written: false` and nothing else happens.
   *
   * @returns {Promise<{placed: Array, written: boolean, reason: string}>}
   */
  static async turnCard() {
    const state = sooth.read();
    const deck = await sooth.deck();

    if (!deck.length) return { placed: [], written: false, reason: "ISUN.PathNoDeck" };

    const { state: turned, placed } = sooth.turn(state, deck);
    if (!placed.length) return { placed: [], written: false, reason: "ISUN.PathDeckSpent" };

    const written = await sooth.write(turned);
    if (written) await PathOfSuns.#announce(turned, placed, sooth.lookup(deck, turned));
    return { placed, written, reason: "" };
  }

  static async #onTurnCard() {
    const { placed, reason } = await PathOfSuns.turnCard();
    if (!placed.length) {
      ui.notifications?.warn(game.i18n.localize(reason));
      return;
    }
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
        sun: game.i18n.localize(CONFIG.ISUN.suns[sun].label) }) },
      content: `<select name="uuid" style="width:100%">${options}</select>`,
      ok: {
        label: game.i18n.localize("ISUN.PathPlace"),
        callback: (ev, button) => button.form.elements.uuid.value
      },
      rejectClose: false
    });
    if (!chosen) return;

    /* A card played by hand is still a card turn — this is how a table using
     * the physical deck gets what it dealt onto the board — so it is announced
     * like one. */
    const card = left.find(c => c.uuid === chosen);
    const played = sooth.place(state, card, sun);
    await sooth.write(played);
    await PathOfSuns.#announce(played, [{ card, sun }], sooth.lookup(deck, played));
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
