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
 * ── When the card turns ──
 * After the effect is chosen, not before. The sentence is "The GM determines
 * the flux effect and immediately turns a new Sooth card" — determine, then
 * turn — and at the table it reads in that order too: the magic goes wrong, we
 * learn what it did, and the world answers with a new card.
 *
 * It turned on sight at first, which put the board's announcement between the
 * roll and its consequence and made three cards that had nothing to say to
 * each other.
 *
 * A flux nobody finalises therefore turns nothing. That is the honest reading —
 * it is not finished — and a GM who wants the card without picking off a chart
 * still has the board's own Turn button.
 *
 * ── Why the roller does not do it ──
 * A player rolls, and the board is a world setting no player may write. So the
 * roll flags its message, and a GM resolves it.
 *
 * Which GM: whichever one chooses the effect, claiming the turn as it goes. Not
 * an elected one. Electing the lowest-id active GM is the rule this system uses
 * for migrations, and it is right there because a migration the elected client
 * misses simply runs on the next load. A flux has no next load. Elected, it
 * went to a GM whose session was marked active but was no longer there, and the
 * flux did nothing at all — no card, no button, no error, and a flag left
 * saying it had not happened yet.
 */
export const SCOPE = "invisible-sun";
export const FLAG = "flux";

/**
 * The two things a flux needs done that it cannot do itself.
 *
 * Turning a Sooth card is the board's, and choosing an effect wants a window.
 * Both live in apps/, and importing them from here pointed a rule at an
 * application — which is backwards, and had a cost beyond tidiness: apps read
 * `foundry.applications.api` as they load, so this module and dice.mjs, which
 * imports it, could not be loaded in Node at all. Two files of rules with no
 * way to test them, because of what they reached for.
 *
 * So they are handed in at startup instead. `listen` takes them, because a
 * listener wired without them would be a flux that quietly does nothing — the
 * failure this already had once, for a different reason.
 */
const uses = { turnCard: null, chooseEffect: null };

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

  const { placed, reason } = await uses.turnCard();

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

  const warning = html.querySelector(".flux-warning");
  if (!warning) return;

  const actor = flux.actor ? game.actors.get(flux.actor) : null;

  renderEffect(message, warning, flux, actor);

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
 * What the flux did, drawn under the warning.
 *
 * Shown to everyone once chosen, and offered as a button only to a GM who has
 * not chosen yet — the same reasoning as the Despair, and the same place.
 */
function renderEffect(message, warning, flux, actor) {
  if (flux.effect) {
    const said = document.createElement("p");
    said.className = "flux-effect-chosen";
    said.textContent = flux.effect.text;
    warning.append(said);
    return;
  }
  if (!game.user.isGM) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "flux-choose";
  button.innerHTML = `<i class="fa-solid fa-burst"></i> `
    + game.i18n.localize("ISUN.FluxChooseEffect");
  button.addEventListener("click", () => chooseEffect(message, actor));
  warning.append(button);
}

/**
 * Pick an effect off the charts and tell the table.
 *
 * Posted as its own message rather than only written back onto this one. The
 * effect is chosen after the fact — the GM reads the room first — and by then
 * the roll has scrolled away; the Sooth turn announces itself the same way for
 * the same reason.
 */
export async function chooseEffect(message, actor) {
  const flux = message.getFlag(SCOPE, FLAG);
  if (!flux || flux.effect) return;

  const chosen = await uses.chooseEffect({ intensity: flux.intensity, actor });
  if (!chosen) return;

  /* Choosing the effect is choosing to have it happen, so what the sheet can
   * do about it is done — no second confirmation. The charts state their
   * effects flatly ("You gain 1 vex to Sorcery") and only the ten the importer
   * could read without ambiguity carry anything to apply; the rest say nothing
   * the sheet could act on and nothing happens. See importers/way.mjs. */
  const applied = actor ? await applyEffects(actor, chosen.effects) : [];

  await message.setFlag(SCOPE, FLAG, {
    ...flux,
    effect: { uuid: chosen.uuid, text: chosen.text, intensity: chosen.intensity, applied }
  });

  const { renderTemplate } = foundry.applications.handlebars;
  const content = await renderTemplate("systems/invisible-sun/templates/chat/flux-effect.hbs", {
    text: chosen.text,
    uuid: chosen.uuid,
    applied,
    intensity: chosen.intensity,
    /* The chart it was taken off is not mentioned. Reaching across the charts
     * is the GM's to do and the table has no use for knowing they did — what
     * happened is the fiction, and where it was looked up is not. */
    intensityLabel: game.i18n.localize(CONFIG.ISUN.fluxIntensities[chosen.intensity] ?? ""),
    name: actor?.name ?? ""
  });

  await ChatMessage.create({
    speaker: actor ? ChatMessage.getSpeaker({ actor }) : {},
    content
  });

  /* And now the card, last, so the board's announcement answers the flux rather
   * than interrupting it. */
  await turnFor(message);
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

/**
 * Do what the chosen effect says, where the sheet can.
 *
 * Only what the importer read without ambiguity — an entry that happens to
 * someone else, or that sets a standing condition, carries nothing here and is
 * left for the GM to adjudicate.
 *
 * Returns a line per thing done, so the card can say what changed rather than
 * leaving a player to notice their Sorcery pool is different.
 */
export async function applyEffects(actor, effects) {
  const done = [];
  const poolLabel = (key) =>
    game.i18n.localize(CONFIG.ISUN.poolLabels[key] ?? key);

  for (const effect of effects ?? []) {
    const { kind, pool, amount } = effect;
    switch (kind) {
      case "vex": {
        if (await actor.addVex(pool, amount) === null) break;
        done.push(game.i18n.format("ISUN.FluxAppliedVex",
          { amount, pool: poolLabel(pool) }));
        break;
      }
      case "pool": {
        if (await actor.adjustPool(pool, amount) === null) break;
        done.push(game.i18n.format("ISUN.FluxAppliedPool",
          { amount: Math.abs(amount), pool: poolLabel(pool) }));
        break;
      }
      case "anguish":
      case "wound": {
        await actor.applyDamage({
          amount, type: kind === "anguish" ? "mental" : "physical", direct: true });
        done.push(game.i18n.format(
          kind === "anguish" ? "ISUN.FluxAppliedAnguish" : "ISUN.FluxAppliedWound", { amount }));
        break;
      }
      case "hiddenKnowledge": {
        const hk = actor.system.stats?.hiddenKnowledge;
        if (!hk) break;
        await actor.update({
          "system.stats.hiddenKnowledge.value": Math.max(0, (hk.value ?? 0) + amount)
        });
        done.push(game.i18n.format("ISUN.FluxAppliedKnowledge", { amount: Math.abs(amount) }));
        break;
      }
    }
  }
  return done;
}

/**
 * A flux the GM brings about, with no roll behind it.
 *
 * "The GM can also introduce a flux effect (as a GM shift) any time a vislae
 * uses a magical practice, whether dice are rolled or not. In this case, 1
 * Despair is always given to the vislae. The GM should associate the flux
 * intensity (minor, major, or grand) with the approximate number of dice that
 * are (or would be) rolled" (The Way, p13).
 *
 * Always, where a rolled flux is only sometimes — so the Despair is given here
 * rather than offered, and the card says it has been. That difference is the
 * only one: the same message, the same warning, the same card turn, the same
 * picker. A table should not have to learn two of anything.
 *
 * ── That a card turns for this too ──
 * The Way attaches the card turn to the paragraph about dice, and says of a GM
 * shift only that the Despair is always given. Read alone it leaves the turn
 * open to argument.
 *
 * The Gate settles it from the other side. Listing what should prompt a card
 * turn, it names both "A GM shift is introduced" and "Magical flux occurs"
 * (The Gate, p7) — separately, so a GM-shift flux answers to each of them.
 *
 * It is guidance rather than a rule: the list is what "probably should trigger
 * a card turn", played "at the GM's discretion". So the turn happens and the
 * board's undo is the discretion.
 *
 * The intensity is the GM's because there are no dice to read it off.
 */
export async function raise({ actor, intensity = "minor", label = "" }) {
  if (!game.user.isGM || !actor) return null;

  /* Given before the message, so the card is drawn already saying so and there
   * is no moment where it offers a Despair that is on its way. */
  await actor.update({
    "system.advancement.despair": (actor.system.advancement?.despair ?? 0) + 1
  });

  const { renderTemplate } = foundry.applications.handlebars;
  const content = await renderTemplate("systems/invisible-sun/templates/chat/dice-result.hbs", {
    shift: true,
    label: label || game.i18n.localize("ISUN.FluxShiftLabel"),
    fluxIntensity: intensity,
    fluxIntensityLabel: game.i18n.localize(CONFIG.ISUN.fluxIntensities[intensity] ?? ""),
    fluxReason: "ISUN.FluxShiftWarning"
  });

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    flags: { [SCOPE]: { [FLAG]: {
      count: 0, intensity, actor: actor.id, done: false, despair: true, shift: true
    } } }
  });
}

/**
 * Ask which vislae, and how hard.
 *
 * Every vislae in the world rather than only the ones with a token: a flux can
 * follow a practice used anywhere, and the book's own example is a spell cast
 * on oneself with no roll and no scene.
 */
export async function promptShift() {
  const { DialogV2 } = foundry.applications.api;
  const vislae = game.actors.filter(a => a.type === "Vislae")
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!vislae.length) {
    ui.notifications?.warn(game.i18n.localize("ISUN.FluxShiftNoVislae"));
    return null;
  }

  const esc = foundry.utils.escapeHTML;
  const who = vislae.map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join("");
  const how = Object.entries(CONFIG.ISUN.fluxIntensities)
    .map(([key, label]) =>
      `<option value="${esc(key)}">${esc(game.i18n.localize(label))}</option>`).join("");

  const chosen = await DialogV2.wait({
    window: { title: game.i18n.localize("ISUN.FluxShiftTitle"), icon: "fa-solid fa-burst" },
    classes: ["invisible-sun", "flux-shift-dialog"],
    content: `<div class="flux-shift-form">
        <p class="hint">${game.i18n.localize("ISUN.FluxShiftHint")}</p>
        <div class="form-group">
          <label>${game.i18n.localize("ISUN.FluxShiftWho")}</label>
          <select name="actor">${who}</select>
        </div>
        <div class="form-group">
          <label>${game.i18n.localize("ISUN.FluxShiftIntensity")}</label>
          <select name="intensity">${how}</select>
        </div>
      </div>`,
    buttons: [
      { action: "raise", label: game.i18n.localize("ISUN.FluxShiftRaise"), default: true,
        icon: "fa-solid fa-burst",
        callback: (event, button) => ({
          actor: button.form.elements.actor.value,
          intensity: button.form.elements.intensity.value
        }) },
      { action: "cancel", label: game.i18n.localize("ISUN.Cancel"), icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!chosen?.actor) return null;

  return raise({ actor: game.actors.get(chosen.actor), intensity: chosen.intensity });
}

/**
 * Listen once, at ready, with the two things above.
 *
 * @param {object}   deps
 * @param {Function} deps.turnCard      turns the next Sooth card
 * @param {Function} deps.chooseEffect  asks the GM which effect it was
 */
export function listen({ turnCard, chooseEffect }) {
  uses.turnCard = turnCard;
  uses.chooseEffect = chooseEffect;
  Hooks.on("renderChatMessageHTML", (message, html) => render(message, html));
}
