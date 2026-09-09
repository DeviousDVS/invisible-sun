/**
 * Invisible Sun — the Maker's Matrix, set up and run
 *
 * "The Maker starts by identifying the magical item they want to make. The
 * effect dictates the level required, as found on the Effects by Level table.
 * This is then modified by the kind of item being made" (The Way, p59).
 *
 * `begin` asks that: what is being made, how long its magic should last, and
 * what the Maker will accept to make the work easier. Everything else on it is
 * arithmetic done for them — the level, the Sorcery it ties up, the days it
 * takes, and the level the first material has to be.
 *
 * `step` then walks the chart, one box a press. The bench on the Magic tab is
 * already the display, so there is no second window repeating it: what this
 * does is the thing the process is waiting for, and hands the answer to
 * `helpers/matrix.mjs`, which owns where it goes next.
 *
 * ── Why the sums are shown before anything is committed ──
 * A commission runs for weeks of game time and locks away a chunk of the pool
 * the whole while. Those are the numbers a Maker decides on, so they are on
 * screen and moving before the work starts rather than discovered afterwards:
 * change the item from a one-use ephemera to something constant and the level
 * climbs four, the Sorcery with it, and the days double.
 *
 * ── What this does not do ──
 * It does not look the effect up. The Effects by Level table is Monte Cook
 * Games' text and is not in the system until somebody imports their own copy,
 * so the level is typed and the table is consulted on paper. Phase 4 of the
 * plan replaces the number with a picker; nothing else here changes when it
 * does.
 */
import * as matrix from "../helpers/matrix.mjs";
import { VentureDialog } from "./VentureDialog.mjs";

const { DialogV2 } = foundry.applications.api;

export class MakerMatrix {

  /**
   * Ask what is being made, and put it on the bench.
   *
   * One work at a time. A Maker with something already on the bench is told so
   * rather than having it quietly replaced — the thing on the bench may be six
   * days and four challenges old.
   */
  static async begin(actor) {
    if (!actor) return null;
    if (actor.system?.making?.node) {
      ui.notifications?.warn(game.i18n.format("ISUN.MakerAlreadyWorking",
        { effect: actor.system.making.effect || game.i18n.localize("ISUN.BenchUnnamed") }));
      return null;
    }

    const chosen = await DialogV2.wait({
      window: { title: game.i18n.format("ISUN.MakerBeginTitle", { name: actor.name }),
                icon: "fa-solid fa-hammer" },
      classes: ["invisible-sun", "maker-setup"],
      position: { width: 460 },
      content: this.#content(),
      buttons: [
        { action: "begin", default: true, icon: "fa-solid fa-hammer",
          label: game.i18n.localize("ISUN.MakerBeginStart"),
          callback: (event, button) =>
            new foundry.applications.ux.FormDataExtended(button.form).object },
        { action: "cancel", label: game.i18n.localize("ISUN.Cancel"), icon: "fa-solid fa-xmark" }
      ],
      render: (event, dialog) => this.#live(dialog.element),
      rejectClose: false
    });

    if (!chosen || chosen === "cancel") return null;
    return this.#start(actor, chosen);
  }

  /**
   * Take the next step, whatever the next step happens to be.
   *
   * One press, one box of the chart. The bench on the sheet is already the
   * display — where the work has got to, what it has cost, what it is waiting
   * for — so this adds no second window repeating it. What it does is the thing
   * the process is actually waiting for: throw the challenge, put the component
   * in, or ask whether to go on.
   *
   * Nothing here decides where the work goes next. `helpers/matrix.mjs` owns the
   * chart; this collects an answer and hands it over.
   */
  static async step(actor) {
    const making = actor?.system?.making;
    if (!making?.node) return null;

    const at = matrix.step(making);
    if (at.ends) return this.#finish(actor, making, at.ends);

    let answer = null;
    if (at.needs === "roll") answer = await this.#challenge(actor, making, at);
    else if (at.needs === "add") answer = await this.#component(actor, at);
    else if (at.needs === "choose") answer = await this.#continue(actor, making);
    if (!answer) return null;

    const moved = matrix.advance(making, answer);
    await actor.update({ system: { making: moved } });

    /* A step can walk straight into an ending — a failed last challenge, or a
     * Continue? answered "no" short of the target. Say so at once rather than
     * leaving the outcome to be noticed on the sheet. */
    const ended = matrix.ended(moved);
    if (ended) await this.#finish(actor, moved, ended);
    return moved;
  }

  /**
   * Throw a challenge.
   *
   * The venture roll the system already has, with two things said about it:
   * Sortilege is withheld, because "Makers cannot use Sortilege while crafting
   * items", and no pool is named, which is what makes the dialog offer the
   * skills — "they can add any applicable skill (woodworking, metalworking, and
   * the like, as appropriate to the item)" (The Way, p59).
   */
  static async #challenge(actor, making, at) {
    const result = await VentureDialog.open(actor, {
      challenge: at.challenge,
      label: game.i18n.format("ISUN.MakerChallengeLabel", {
        effect: making.effect || game.i18n.localize("ISUN.BenchUnnamed"),
        step: game.i18n.localize(CONFIG.ISUN.makerNodeLabels?.[at.node] ?? at.node)
      }),
      allowSortilege: false
    });
    /* Dismissed rather than rolled. Nothing happened, so the process has not
     * moved and no day has been spent on it. */
    if (!result) return null;
    return result.success ? "success" : "failure";
  }

  /**
   * Put a component in.
   *
   * Shown, not taken. Whether the Maker has the thing, and what it cost them, is
   * the table's business — this system reports its limits rather than enforcing
   * them, and a process that quietly ate a level 7 ingredient three sessions
   * into a commission would be the one place it did not.
   *
   * What it does do is answer "what am I looking for": the level, what the goods
   * lists hold at that level, and how many leaves would stand in instead.
   */
  static async #component(actor, at) {
    const level = at.componentLevel;
    const held = level == null ? [] : await this.#materialsAt(level);
    const leaves = level == null ? 0 : matrix.leavesFor(level);

    const listed = held.length
      ? `<ul class="maker-materials">${held.slice(0, 12).map(m =>
          `<li><span class="mat-name">${foundry.utils.escapeHTML(m.name)}</span>`
          + `<span class="mat-cost">${foundry.utils.escapeHTML(m.cost)}</span></li>`).join("")}</ul>`
        + (held.length > 12
            ? `<p class="hint">${game.i18n.format("ISUN.MakerMoreMaterials",
                { n: held.length - 12 })}</p>` : "")
      : `<p class="hint">${game.i18n.localize("ISUN.MakerNoMaterials")}</p>`;

    const yes = await DialogV2.confirm({
      window: { title: game.i18n.localize(CONFIG.ISUN.makerNodeLabels?.[at.node] ?? at.node),
                icon: "fa-solid fa-mortar-pestle" },
      classes: ["invisible-sun", "maker-component"],
      position: { width: 420 },
      content: `<p class="notes">${game.i18n.format("ISUN.MakerComponentAsk", { level })}</p>`
        + `<p class="hint">${game.i18n.format("ISUN.MakerLeavesInstead", { n: leaves })}</p>`
        + listed,
      rejectClose: false
    });
    return yes ? "added" : null;
  }

  /**
   * What the goods lists hold at a level.
   *
   * "Examples of various materials, ingredients, and so on can be found in the
   * goods lists, but many more such substances exist" (The Way, p60) — examples,
   * so this offers rather than restricts, and a Maker using something the books
   * never named simply says it is in.
   */
  static async #materialsAt(level) {
    const pack = game.packs.get("invisible-sun.gear");
    if (!pack) return [];
    const index = await pack.getIndex({ fields: ["system.level", "system.cost", "system.category"] });
    return [...index]
      .filter(e => (e.system?.level ?? 0) === level)
      .map(e => ({ name: e.name, cost: e.system?.cost ?? "" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Go on, or stop here?
   *
   * "At any point in the process, the Maker can opt to quit. If they do so after
   * successfully adding an ingredient, they get an item with a random effect"
   * (The Way, p60). So stopping is not cancelling — it is a way of finishing,
   * and the dialog says which of the two it would be before it is chosen.
   */
  static async #continue(actor, making) {
    const reached = making.x >= making.target;
    const chosen = await DialogV2.wait({
      window: { title: game.i18n.localize("ISUN.MakerNodeContinue"), icon: "fa-solid fa-hammer" },
      classes: ["invisible-sun"],
      content: `<p>${game.i18n.format("ISUN.MakerContinueAsk",
        { x: making.x, target: making.target })}</p>`
        + `<p class="notes">${game.i18n.localize(reached
            ? "ISUN.MakerStopFinishes" : "ISUN.MakerStopRandom")}</p>`,
      buttons: [
        { action: "yes", default: true, icon: "fa-solid fa-hammer",
          label: game.i18n.localize("ISUN.MakerGoOn"), callback: () => "yes" },
        { action: "no", icon: "fa-solid fa-flag-checkered",
          label: game.i18n.localize(reached ? "ISUN.MakerFinishIt" : "ISUN.MakerStopHere"),
          callback: () => "no" }
      ],
      rejectClose: false
    });
    return chosen === "yes" || chosen === "no" ? chosen : null;
  }

  /**
   * Say how it ended.
   *
   * The bench keeps showing the finished work until somebody puts it down: what
   * a mishap does to a Maker, and what a random effect turned out to be, are
   * both the table's to settle, and clearing the bench automatically would take
   * the conversation away before it happened.
   */
  static async #finish(actor, making, ending) {
    const already = making.announced === ending;
    if (already) return making;

    /* The flaw count is its own sentence rather than a slot in the main one:
     * "1 flaws worked in" is the kind of thing a table reads once and stops
     * trusting the rest of. */
    const flaws = (making.sideEffects ?? []).length;
    const carries = flaws === 0 ? ""
      : " " + game.i18n.format(flaws === 1 ? "ISUN.MakerCarriesOneFlaw"
                                           : "ISUN.MakerCarriesFlaws", { n: flaws });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p><strong>${game.i18n.localize(CONFIG.ISUN.makerNodeLabels?.[ending] ?? ending)}</strong></p>`
        + `<p>${game.i18n.format(`ISUN.MakerEnd${ending.charAt(0).toUpperCase()}${ending.slice(1)}`, {
              effect: making.effect || game.i18n.localize("ISUN.BenchUnnamed"),
              level: ending === "randomEffect" ? making.x : making.level,
              days: matrix.daysFor({ level: making.level, failures: making.failures }).days
            })}${carries}</p>`
    });
    await actor.update({ "system.making.announced": ending });
    return making;
  }

  /**
   * What the form asks for.
   *
   * Five questions, and only the first two are ever compulsory. The rest are
   * the Maker choosing to make the work easier or faster at a price, and they
   * default to not doing so.
   */
  static #content() {
    const kinds = CONFIG.ISUN.makerItemKinds ?? {};
    const options = Object.entries(kinds).map(([key, spec]) =>
      `<option value="${key}"${key === "object0to4" ? " selected" : ""}>`
      + `${foundry.utils.escapeHTML(game.i18n.localize(spec.label))}</option>`).join("");

    return `<div class="maker-setup-body">
      <p class="notes">${game.i18n.localize("ISUN.MakerBeginIntro")}</p>

      <div class="form-group">
        <label for="isun-maker-effect">${game.i18n.localize("ISUN.MakerEffect")}</label>
        <input type="text" id="isun-maker-effect" name="effect"
               placeholder="${game.i18n.localize("ISUN.MakerEffectPlaceholder")}" />
      </div>

      <div class="form-group">
        <label for="isun-maker-level">${game.i18n.localize("ISUN.MakerEffectLevel")}</label>
        <input type="number" id="isun-maker-level" name="effectLevel" value="1" min="1" max="10" />
      </div>
      <p class="hint">${game.i18n.localize("ISUN.MakerEffectLevelHint")}</p>

      <div class="form-group">
        <label for="isun-maker-kind">${game.i18n.localize("ISUN.MakerKind")}</label>
        <select id="isun-maker-kind" name="kind">${options}</select>
      </div>
      <p class="hint">${game.i18n.localize("ISUN.MakerKindHint")}</p>

      <!-- The two prices a Maker can agree to in advance. Both make the work
           easier or shorter and both cost something the item keeps. -->
      <fieldset class="maker-tradeoffs">
        <legend>${game.i18n.localize("ISUN.MakerTradeoffs")}</legend>

        <div class="form-group">
          <label for="isun-maker-minor">${game.i18n.localize("ISUN.MakerMinorFlaws")}</label>
          <input type="number" id="isun-maker-minor" name="minor" value="0" min="0" max="3" />
        </div>
        <div class="form-group">
          <label for="isun-maker-major">${game.i18n.localize("ISUN.MakerMajorFlaws")}</label>
          <input type="number" id="isun-maker-major" name="major" value="0" min="0" max="3" />
        </div>
        <p class="hint">${game.i18n.localize("ISUN.MakerFlawsHint")}</p>

        <div class="form-group">
          <label for="isun-maker-shaved">${game.i18n.localize("ISUN.MakerShaved")}</label>
          <input type="number" id="isun-maker-shaved" name="shaved" value="0" min="0" />
        </div>
        <p class="hint">${game.i18n.localize("ISUN.MakerShavedHint")}</p>
      </fieldset>

      <!-- What all of that comes to. Recomputed on every change, because these
           four numbers are what the Maker is actually deciding between. -->
      <ul class="maker-reckoning">
        <li><span class="reckon-n" data-reckon="level">1</span>
            ${game.i18n.localize("ISUN.MakerItemLevel")}</li>
        <li><span class="reckon-n" data-reckon="inProcess">1</span>
            ${game.i18n.localize("ISUN.MakerWorkedAs")}</li>
        <li><span class="reckon-n" data-reckon="sorcery">1</span>
            ${game.i18n.localize("ISUN.MakerSorceryHeld")}</li>
        <li><span class="reckon-n" data-reckon="days">2</span>
            ${game.i18n.localize("ISUN.MakerDays")}</li>
      </ul>
      <p class="hint" data-reckon="material"></p>
      <p class="notes warning" data-reckon="warning" hidden></p>
    </div>`;
  }

  /**
   * Keep the four numbers honest while the form is being filled in.
   *
   * Read from the form every time rather than tracked alongside it: the arithmetic
   * has one source and it is what the Maker can see.
   */
  static #live(root) {
    const num = (name) => Number(root.querySelector(`[name="${name}"]`)?.value) || 0;
    const show = (key, value) => {
      const el = root.querySelector(`[data-reckon="${key}"]`);
      if (el) el.textContent = value;
    };

    const update = () => {
      const spec = {
        effectLevel: num("effectLevel"),
        kind: root.querySelector('[name="kind"]')?.value ?? "object0to4",
        minor: num("minor"),
        major: num("major")
      };
      const { level, inProcess } = matrix.craftLevel(spec);
      const { days, challengeBonus } = matrix.daysFor({ level, shaved: num("shaved") });

      show("level", level);
      show("inProcess", inProcess);
      /* The Sorcery is the item's level, not the level it is worked at: a flaw
       * accepted in advance makes the work easier and the item no cheaper. */
      show("sorcery", level);
      show("days", days);
      show("material", game.i18n.format("ISUN.MakerMaterialNeeded", { level }));

      /* Said out loud rather than left to be discovered on the first roll. */
      const warning = root.querySelector('[data-reckon="warning"]');
      if (warning) {
        const notes = [];
        if (challengeBonus) {
          notes.push(game.i18n.format("ISUN.MakerHurryWarning", { n: challengeBonus }));
        }
        if (level > 10) notes.push(game.i18n.localize("ISUN.MakerAboveTen"));
        warning.textContent = notes.join(" ");
        warning.hidden = !notes.length;
      }
    };

    root.addEventListener("input", update);
    root.addEventListener("change", update);
    update();
  }

  /**
   * Put the work on the bench.
   *
   * The deliberate flaws are seeded onto the work as flaws, because that is what
   * they are: "side effects can affect the final value of an item (almost
   * certainly lowering it), but they do not change its final level". Agreeing to
   * one in advance buys an easier process, not a cleaner item.
   */
  static async #start(actor, form) {
    const spec = {
      effectLevel: Math.max(1, Number(form.effectLevel) || 1),
      kind: form.kind || "object0to4",
      minor: Math.max(0, Number(form.minor) || 0),
      major: Math.max(0, Number(form.major) || 0)
    };
    const { level, inProcess } = matrix.craftLevel(spec);
    const state = matrix.begin({
      level, inProcess, shaved: Math.max(0, Number(form.shaved) || 0)
    });

    const making = {
      ...state,
      effect: String(form.effect ?? "").trim(),
      effectLevel: spec.effectLevel,
      kind: spec.kind,
      startedDay: actor.system?.meta?.day ?? 0,
      sideEffects: [
        ...Array(spec.minor).fill("minor"),
        ...Array(spec.major).fill("major")
      ]
    };

    await actor.update({ system: { making } });
    ui.notifications?.info(game.i18n.format("ISUN.MakerBegun",
      { effect: making.effect || game.i18n.localize("ISUN.BenchUnnamed"), level }));
    return making;
  }
}
