/**
 * Invisible Sun — what happens when magic fluxes
 *
 * "The GM determines the flux effect and immediately turns a new Sooth card.
 * Significantly detrimental flux is sometimes accompanied by 1 Despair for the
 * person affected" (The Way, p13).
 *
 * Two consequences, and the books are precise about the difference between
 * them. The card turn is unconditional — *immediately* — so it happens without
 * being asked for. The Despair is *sometimes*, and only for flux that is
 * significantly detrimental, which is a judgement about the effect the GM has
 * yet to choose. So it is offered rather than applied.
 *
 * (Flux the GM introduces as a shift, without dice, is the other way round: "1
 * Despair is always given to the vislae." That is a different entry point and
 * is not this one.)
 *
 * ── Why the roller does not do it ──
 * A player rolls, and the board is a world setting no player may write. So the
 * roll flags its message, and a GM client acts on the flag.
 *
 * Which GM: the first one to draw the card, claiming it as it goes. Not an
 * elected one. Electing the lowest-id active GM is the rule this system uses
 * for migrations, and it is right there because a migration that the elected
 * client misses simply runs on the next load. A flux has no next load. Elected,
 * it went to a GM whose session was still marked active but was no longer
 * there, and the flux did nothing at all — no card, no button, no error, and a
 * flag left saying it had not happened yet.
 *
 * Acting as the card is drawn cannot be missed that way: a GM who is not there
 * draws nothing, and the next GM who does picks it up. The cost is that two
 * GMs looking at once could both start, which the claim below narrows and the
 * board's undo covers. Silence was the worse failure.
 */
import { PathOfSuns } from "../apps/PathOfSuns.mjs";

export const SCOPE = "invisible-sun";
export const FLAG = "flux";

/**
 * What a rolled flux records on its message.
 *
 * Kept on the message rather than passed to a function because the client that
 * has to act is not the one that rolled, and a document is how the two meet.
 */
export function flagFor({ fluxCount, fluxIntensity, actor }) {
  return { count: fluxCount, intensity: fluxIntensity, actor: actor?.id ?? null, done: false };
}

/**
 * Turn a Sooth card because magic fluxed.
 *
 * Called on every client that draws the card; does nothing on all but the first
 * GM to reach it.
 *
 * The claim is written before the turn rather than after. A turn can chain — an
 * Adept plays another card — so it is not instant, and a second GM arriving
 * meanwhile would otherwise start one too. Writing first, then reading back
 * what the server kept, means the loser of a race stands down instead.
 */
export async function turnFor(message) {
  const flux = message.getFlag(SCOPE, FLAG);
  if (!flux || flux.done) return;
  if (!game.user.isGM) return;

  await message.setFlag(SCOPE, FLAG, { ...flux, done: true, by: game.user.id });
  if (message.getFlag(SCOPE, FLAG)?.by !== game.user.id) return;

  const { placed, reason } = await PathOfSuns.turnCard();

  /* A spent deck is worth saying out loud: the rule wanted a card turned and
   * there was none to turn, and silence would read as the flux having been
   * handled. */
  if (!placed.length && reason) {
    ui.notifications?.warn(game.i18n.localize(reason));
  }
  return placed;
}

/**
 * Offer the Despair, on the clients allowed to give it.
 *
 * Injected as the card is drawn rather than written into its content, because
 * content is rendered once by whoever rolled and then stored: a button put
 * there by a player's client would be missing, and one put there by a GM's
 * would be offered to everybody.
 */
export function render(message, html) {
  const flux = message.getFlag(SCOPE, FLAG);
  if (!flux) return;

  /* The card turn happens here, not on creation. See the note at the top. */
  if (!flux.done) turnFor(message);

  const warning = html.querySelector(".flux-warning");
  if (!warning) return;

  const actor = flux.actor ? game.actors.get(flux.actor) : null;

  if (flux.despair) {
    const said = document.createElement("p");
    said.className = "flux-despair-given";
    said.textContent = game.i18n.format("ISUN.FluxDespairGiven",
      { name: actor?.name ?? game.i18n.localize("ISUN.FluxTheVislae") });
    warning.append(said);
    return;
  }
  if (!game.user.isGM || !actor) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "flux-despair";
  button.dataset.tooltip = game.i18n.localize("ISUN.FluxDespairHint");
  button.innerHTML = `<i class="fa-solid fa-heart-crack"></i> `
    + game.i18n.format("ISUN.FluxGiveDespair", { name: actor.name });
  button.addEventListener("click", () => giveDespair(message));
  warning.append(button);
}

/**
 * One Despair, to the vislae the flux happened to.
 *
 * "Significantly detrimental flux is sometimes accompanied by 1 Despair for the
 * person affected" (The Way, p13) — sometimes, and about an effect the GM has
 * not chosen yet, so this is never automatic the way the card turn is.
 *
 * Recorded on the message as well as on the actor, so the offer is not made
 * twice and every client can see it was taken.
 */
export async function giveDespair(message) {
  const flux = message.getFlag(SCOPE, FLAG);
  if (!flux || flux.despair) return;
  const actor = flux.actor ? game.actors.get(flux.actor) : null;
  if (!actor) return;

  await actor.update({
    "system.advancement.despair": (actor.system.advancement?.despair ?? 0) + 1
  });
  await message.setFlag(SCOPE, FLAG, { ...flux, despair: true });
}

/** Listen once, at ready. */
export function listen() {
  Hooks.on("renderChatMessageHTML", (message, html) => render(message, html));
}
