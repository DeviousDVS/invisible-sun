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
 * ── The three tables the process sends a Maker to ──
 * Effects by Level, the side effects and the mishaps are Monte Cook Games' text
 * and reach a world only by being imported from The Way, into the
 * `matrix-tables` pack. So every use of them here asks first and copes with the
 * answer being no: the setup dialog offers the effects to pick from when they
 * are there and asks for the level by hand when they are not, and a flaw or a
 * mishap with no table behind it is named by its severity rather than invented.
 *
 * A table says what it is for in a flag rather than by its name — see
 * `TABLE_FLAG` — so a GM may rename or translate one without hiding it.
 */
import * as matrix from "../helpers/matrix.mjs";
import { TABLE_FLAG } from "../importers/matrix-tables.mjs";
import { VentureDialog } from "./VentureDialog.mjs";

const { DialogV2 } = foundry.applications.api;

/** Where the three tables live once The Way has been read. */
const TABLE_PACK = "invisible-sun.matrix-tables";

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

    /* Asked for once, here, rather than by the dialog: whether The Way has been
     * imported decides both what the form looks like and how wide it needs to
     * be, and neither of those is a question the form can answer about itself. */
    const effects = await this.#effects();

    const chosen = await DialogV2.wait({
      window: { title: game.i18n.format("ISUN.MakerBeginTitle", { name: actor.name }),
                icon: "fa-solid fa-hammer" },
      classes: ["invisible-sun", "maker-setup"],
      position: { width: effects.length ? 600 : 460 },
      content: this.#content(effects),
      buttons: [
        { action: "begin", default: true, icon: "fa-solid fa-hammer",
          label: game.i18n.localize("ISUN.MakerBeginStart"),
          callback: (event, button) => {
            const form = new foundry.applications.ux.FormDataExtended(button.form).object;
            /* The line the Maker picked off the table, which no form data
             * carries: the radio's value is the level, because the level is
             * what the arithmetic below needs, and the words are what the
             * bench will show. */
            form.pickedText = button.form
              .querySelector('input[name="effectPick"]:checked')?.dataset.text ?? "";
            return form;
          } },
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

    /* Every box answers the same shape: what the chart is to be told, and
     * whatever the answer turned out to say — which for a side effect is the
     * line the table gave, and for everything else is nothing. */
    let taken = null;
    if (at.needs === "roll") taken = await this.#challenge(actor, making, at);
    else if (at.needs === "add") taken = await this.#component(actor, at);
    else if (at.needs === "choose") taken = await this.#continue(actor, making);
    else if (at.needs === "sideEffect") taken = await this.#sideEffect(actor, at);
    if (!taken) return null;

    const moved = matrix.advance(making, taken.answer, taken.detail);
    await actor.update({ system: { making: moved } });

    /* A step can walk straight into an ending — a failed last challenge, or a
     * Continue? answered "no" short of the target. Say so at once rather than
     * leaving the outcome to be noticed on the sheet. */
    const ended = matrix.ended(moved);
    if (ended) await this.#finish(actor, moved, ended);
    return moved;
  }

  /**
   * Take the finished thing off the bench.
   *
   * "Success means that the item is created" — and the item is a real one: an
   * object of power or an ephemera on the Maker's own sheet, at the level the
   * work was for, carrying the depletion its kind implies and every flaw the
   * process worked into it.
   *
   * Two questions are asked because two things are genuinely the Maker's and
   * nothing here can know them. The name is theirs, and for a work that stopped
   * short the effect is not the one they set out to make. The form is theirs
   * too — "material appropriate to the item (metal for a knife, leather for
   * shoes)" is chosen at the bench, and every card in the books states one.
   *
   * Everything else is already settled and is shown rather than asked.
   *
   * The bench is cleared by the same act, which is what gives the Sorcery back:
   * "for the duration of the process, the Maker's Sorcery pool faces this
   * deduction… until it is completed" (The Way, p60). Held, never spent, and
   * the holding ends here.
   */
  static async take(actor) {
    const making = actor?.system?.making;
    const ending = making ? matrix.ended(making) : null;
    if (ending !== "created" && ending !== "randomEffect") return null;

    /* An item nobody chose is the level the work actually reached, not the one
     * it was aiming at — it stopped short, and that is the whole difference
     * between the two endings. */
    const level = ending === "randomEffect" ? making.x : making.level;
    const kind = CONFIG.ISUN.makerItemKinds?.[making.kind] ?? {};
    const effect = ending === "randomEffect" && making.outcome
      ? making.outcome : (making.effect || "");

    const chosen = await DialogV2.wait({
      window: { title: game.i18n.format("ISUN.MakerTakeTitle",
                  { effect: making.effect || game.i18n.localize("ISUN.BenchUnnamed") }),
                icon: "fa-solid fa-gem" },
      classes: ["invisible-sun", "maker-take"],
      position: { width: 460 },
      content: this.#takeContent(making, { ending, level, kind, effect }),
      buttons: [
        { action: "take", default: true, icon: "fa-solid fa-gem",
          label: game.i18n.localize("ISUN.MakerTakeIt"),
          callback: (event, button) =>
            new foundry.applications.ux.FormDataExtended(button.form).object },
        { action: "cancel", label: game.i18n.localize("ISUN.Cancel"), icon: "fa-solid fa-xmark" }
      ],
      rejectClose: false
    });
    if (!chosen || chosen === "cancel") return null;

    const name = String(chosen.name ?? "").trim()
      || effect || game.i18n.localize("ISUN.BenchUnnamed");
    const [item] = await actor.createEmbeddedDocuments("Item", [{
      name,
      type: kind.type ?? "ObjectOfPower",
      system: {
        level,
        form: String(chosen.form ?? "").trim(),
        depletion: kind.depletion ?? "",
        description: this.#writeUp(effect, making.sideEffects ?? [])
      }
    }]);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p>${game.i18n.format("ISUN.MakerTookIt", {
        name: foundry.utils.escapeHTML(name),
        level,
        kind: game.i18n.localize(`TYPES.Item.${kind.type ?? "ObjectOfPower"}`)
      })}</p>`
    });

    /* Cleared by the same act. The node is the whole of "is there work", and
     * the rest is left as it lies for the reason the abandon handler gives. */
    await actor.update({ "system.making.node": "" });
    /* Opened, because two of the things a made item wants — what it looks like,
     * and how the effect is worded on it — are the Maker's to write and this is
     * the moment they are thinking about them. */
    item?.sheet?.render(true);
    return item;
  }

  /**
   * Put the work down before it is finished.
   *
   * "At any point in the process, the Maker can opt to quit. If they do so
   * after successfully adding an ingredient, they get an item with a random
   * effect. If the Maker quits at any other time in the process, a mishap
   * occurs" (The Way, p60).
   *
   * The first of those is the chart's own Continue? diamond and is not this.
   * This is quitting anywhere else, and the book is unambiguous about what it
   * costs — so a mishap is what the button offers, and it rolls one.
   *
   * The plain clearing stays beside it, because a bench can also hold a work
   * begun by mistake, or one from a session everybody has agreed to forget, and
   * a rule about a Maker quitting is not a rule about a GM tidying up.
   */
  static async abandon(actor) {
    const bench = actor?.system?.bench;
    if (!bench) return null;

    const effect = bench.effect || game.i18n.localize("ISUN.BenchUnnamed");

    /* A work that has already ended has nothing left to quit — the process is
     * over and what it came to is sitting on the bench. So this is only the
     * clearing, with a word about what clearing it throws away where there is
     * still something on it to keep. */
    if (bench.finished) {
      const yes = await DialogV2.confirm({
        window: { title: game.i18n.localize("ISUN.BenchAbandonTitle"),
                  icon: "fa-solid fa-xmark" },
        classes: ["invisible-sun"],
        content: `<p>${game.i18n.format("ISUN.BenchClearAsk",
            { effect, sorcery: bench.sorceryHeld })}</p>`
          + (bench.takeable
              ? `<p class="notes">${game.i18n.localize("ISUN.BenchClearLosesItem")}</p>` : ""),
        rejectClose: false
      });
      if (!yes) return null;
      await actor.update({ "system.making.node": "" });
      return "clear";
    }

    const chosen = await DialogV2.wait({
      window: { title: game.i18n.localize("ISUN.BenchAbandonTitle"),
                icon: "fa-solid fa-xmark" },
      classes: ["invisible-sun"],
      position: { width: 440 },
      content: `<p>${game.i18n.format("ISUN.BenchAbandonAsk",
          { effect, sorcery: bench.sorceryHeld })}</p>`
        + `<p class="notes">${game.i18n.localize("ISUN.BenchAbandonRule")}</p>`,
      buttons: [
        { action: "mishap", default: true, icon: "fa-solid fa-burst",
          label: game.i18n.localize("ISUN.BenchAbandonMishap"), callback: () => "mishap" },
        { action: "clear", icon: "fa-solid fa-broom",
          label: game.i18n.localize("ISUN.BenchAbandonClear"), callback: () => "clear" },
        { action: "cancel", label: game.i18n.localize("ISUN.Cancel"), icon: "fa-solid fa-reply" }
      ],
      rejectClose: false
    });
    if (chosen !== "mishap" && chosen !== "clear") return null;

    /* Through the chart rather than around it: a mishap is a box of the Matrix,
     * so the work is moved onto it and finished from there. That is what makes
     * the card, the rolled mishap and the bench all say the same thing they
     * would have said had the process failed its way there. */
    if (chosen === "mishap") {
      const making = { ...actor.system.making, node: "mishap", announced: "", outcome: "" };
      await actor.update({ system: { making } });
      await this.#finish(actor, actor.system.making, "mishap");
      return "mishap";
    }

    await actor.update({ "system.making.node": "" });
    return "clear";
  }

  /**
   * What the finished item says about itself.
   *
   * The effect, and then what the process did to it. Side effects are written
   * onto the item rather than left in the chat log because they are part of
   * what it is now — "side effects can affect the final value of an item
   * (almost certainly lowering it), but they do not change its final level".
   */
  static #writeUp(effect, flaws) {
    const esc = foundry.utils.escapeHTML;
    const body = effect ? `<p>${esc(effect)}</p>` : "";
    if (!flaws.length) return body;

    const lines = flaws.map(f => `<li>${esc(f.text
      || game.i18n.localize(f.severity === "major"
        ? "ISUN.MakerFlawMajor" : "ISUN.MakerFlawMinor"))}</li>`).join("");
    return `${body}<p><strong>${game.i18n.localize("ISUN.MakerSideEffects")}</strong></p>`
      + `<ul>${lines}</ul>`;
  }

  /** The two questions, and everything the process has already settled. */
  static #takeContent(making, { ending, level, kind, effect }) {
    const esc = foundry.utils.escapeHTML;
    const flaws = making.sideEffects ?? [];

    const reckon = [
      [game.i18n.localize("ISUN.MakerTakeItIs"),
       game.i18n.localize(`TYPES.Item.${kind.type ?? "ObjectOfPower"}`)],
      [game.i18n.localize("ISUN.MakerTakeLevel"), String(level)],
      [game.i18n.localize("ISUN.MakerTakeDepletion"),
       kind.depletion || game.i18n.localize("ISUN.MakerTakeNoDepletion")],
      [game.i18n.localize("ISUN.MakerTakeFlaws"),
       flaws.length ? String(flaws.length) : game.i18n.localize("ISUN.MakerTakeNoFlaws")]
    ].map(([term, value]) =>
      `<div class="take-line"><span class="take-term">${esc(term)}</span>`
      + `<span class="take-value">${esc(value)}</span></div>`).join("");

    return `<div class="maker-take-body">
      <p class="notes">${game.i18n.localize(ending === "randomEffect"
        ? "ISUN.MakerTakeRandomIntro" : "ISUN.MakerTakeIntro")}</p>

      <div class="form-group">
        <label for="isun-take-name">${game.i18n.localize("ISUN.MakerTakeName")}</label>
        <input type="text" id="isun-take-name" name="name" value="${esc(effect)}" />
      </div>

      <div class="form-group">
        <label for="isun-take-form">${game.i18n.localize("ISUN.MakerTakeForm")}</label>
        <input type="text" id="isun-take-form" name="form"
               placeholder="${game.i18n.localize("ISUN.MakerTakeFormPlaceholder")}" />
      </div>
      <p class="hint">${game.i18n.localize("ISUN.MakerTakeFormHint")}</p>

      <div class="maker-take-reckoning">${reckon}</div>
      <p class="hint">${game.i18n.format("ISUN.MakerTakeSorceryBack",
        { n: making.level })}</p>
    </div>`;
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
    return { answer: result.success ? "success" : "failure" };
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
    return yes ? { answer: "added" } : null;
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
    return chosen === "yes" || chosen === "no" ? { answer: chosen } : null;
  }

  /**
   * Find out what the process just did to the item.
   *
   * "Catalysts or even stabilizers must be added to continue the process" — and
   * what it costs to continue is a flaw the item then keeps. Nothing is decided
   * here: the box has already happened, the press that got here was the
   * consent, and this is the finding out. So it rolls, says so at the table
   * through the table's own card, and moves on.
   *
   * With no side-effect table imported there is still a flaw — the chart says
   * so — and it is recorded with its severity and no words. Inventing a
   * plausible-sounding one would be worse than saying nothing.
   */
  static async #sideEffect(actor, at) {
    const text = await this.#roll({ role: "sideEffects", severity: at.inflicts });
    return { answer: "taken", detail: text };
  }

  /**
   * The Matrix's own tables, as The Way was read into them.
   *
   * Empty rather than an error when the pack is missing or unimported: a world
   * that has not imported the book is the ordinary state of a fresh install,
   * and every caller here is written to cope with the answer being nothing.
   */
  static async #tables() {
    const pack = game.packs.get(TABLE_PACK);
    if (!pack) return [];
    return pack.getDocuments();
  }

  /** The one table marked with all of these, or null. */
  static async #tableFor(match) {
    const wanted = Object.entries(match);
    return (await this.#tables()).find(table => {
      const mark = table.getFlag("invisible-sun", TABLE_FLAG);
      return mark && wanted.every(([key, value]) => mark[key] === value);
    }) ?? null;
  }

  /**
   * Roll one of them, and give back the line it landed on.
   *
   * The table posts its own card, so the roll is public and the result is
   * something the table watched happen rather than a sentence this reported
   * afterwards. `replacement` is set on every table the importer builds, so
   * drawing writes nothing back — which matters, because these live in a pack
   * that is normally locked.
   */
  static async #roll(match) {
    const table = await this.#tableFor(match);
    if (!table) return "";
    const { results } = await table.draw({ displayChat: true });
    return results?.[0]?.name ?? results?.[0]?.text ?? "";
  }

  /**
   * Every effect the book lists, with the level it sits at.
   *
   * One flat list rather than seventeen, because a Maker searching it is
   * looking for what they want to make and the level is the answer, not the
   * question. Sorted by level and then alphabetically, so the list reads as the
   * table does and the cheap effects are at the top where a new Maker will be
   * looking.
   */
  static async #effects() {
    const found = [];
    for (const table of await this.#tables()) {
      const mark = table.getFlag("invisible-sun", TABLE_FLAG);
      if (mark?.role !== "effects") continue;
      for (const result of table.results) {
        const text = result.name ?? result.text ?? "";
        if (text) found.push({ level: Number(mark.level) || 0, text });
      }
    }
    return found.sort((a, b) => a.level - b.level || a.text.localeCompare(b.text));
  }

  /**
   * Say how it ended.
   *
   * The bench keeps showing the finished work until somebody puts it down: what
   * a mishap does to a Maker is a scene, and clearing the bench automatically
   * would take the conversation away before it happened.
   *
   * Two of the three endings send the Maker to a table, so two of them are
   * rolled — once, and kept. Pressing "How did it end?" a second time must give
   * the same answer as the first, which is the same reason `announced` exists:
   * a mishap that changed every time it was read would not be a mishap.
   */
  static async #finish(actor, making, ending) {
    const already = making.announced === ending;
    if (already) return making;

    /* The random effect is rolled at the working level the process actually
     * reached — "if they do so after successfully adding an ingredient, they
     * get an item with a random effect", and the item is the level it got to,
     * not the level it was aiming at. */
    let outcome = making.outcome ?? "";
    if (!outcome && ending === "mishap") outcome = await this.#roll({ role: "mishaps" });
    if (!outcome && ending === "randomEffect") {
      outcome = await this.#roll({ role: "effects", level: making.x });
    }

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
        /* The table said this, so it is set apart from what the system worked
         * out. Absent, not empty, where no table has been imported to say it. */
        + (outcome
            ? `<p class="maker-outcome">${foundry.utils.escapeHTML(outcome)}</p>` : "")
    });
    await actor.update({ "system.making.announced": ending, "system.making.outcome": outcome });
    return making;
  }

  /**
   * What the form asks for.
   *
   * Five questions, and only the first two are ever compulsory. The rest are
   * the Maker choosing to make the work easier or faster at a price, and they
   * default to not doing so.
   */
  static #content(effects) {
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

      ${this.#effectField(effects)}

      <div class="form-group">
        <label for="isun-maker-kind">${game.i18n.localize("ISUN.MakerKind")}</label>
        <select id="isun-maker-kind" name="kind">${options}</select>
      </div>
      <p class="hint">${game.i18n.localize("ISUN.MakerKindHint")}</p>

      <!-- The two prices a Maker can agree to in advance. Both make the work
           easier or shorter and both cost something the item keeps. -->
      <!-- Label, control and explanation on one line each, rather than a
           paragraph underneath: what a price costs is what the Maker is reading
           while they set the number, so it belongs beside the number. The flaw
           hint covers both flaw rows and spans them. -->
      <fieldset class="maker-tradeoffs">
        <legend>${game.i18n.localize("ISUN.MakerTradeoffs")}</legend>

        <label for="isun-maker-minor">${game.i18n.localize("ISUN.MakerMinorFlaws")}</label>
        <input type="number" id="isun-maker-minor" name="minor" value="0" min="0" max="3" />
        <p class="hint spans-flaws">${game.i18n.localize("ISUN.MakerFlawsHint")}</p>

        <label for="isun-maker-major">${game.i18n.localize("ISUN.MakerMajorFlaws")}</label>
        <input type="number" id="isun-maker-major" name="major" value="0" min="0" max="3" />

        <label for="isun-maker-shaved">${game.i18n.localize("ISUN.MakerShaved")}</label>
        <input type="number" id="isun-maker-shaved" name="shaved" value="0" min="0" />
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
   * Where the effect's level comes from.
   *
   * Two shapes, and which one appears is not a preference — it is whether The
   * Way has been read into this world. With the table imported the Maker picks
   * the effect and the level comes with it, which is the order the book puts
   * them in: "the effect dictates the level required". Without it there is
   * nothing to pick from and the level is typed, as it was before the tables
   * existed.
   *
   * Either way one control is named `effectLevel` and one may be named
   * `effectPick`, and `#start` reads whichever it is given — so nothing
   * downstream has to know which shape was drawn.
   */
  static #effectField(effects) {
    const esc = foundry.utils.escapeHTML;

    if (!effects.length) {
      return `<div class="form-group">
        <label for="isun-maker-level">${game.i18n.localize("ISUN.MakerEffectLevel")}</label>
        <input type="number" id="isun-maker-level" name="effectLevel" value="1" min="1" />
      </div>
      <p class="hint">${game.i18n.localize("ISUN.MakerEffectsMissing")}</p>`;
    }

    /* The level rides on the radio because the level is what the arithmetic
     * wants; the words ride in a data attribute because the bench wants those.
     * Both come off the one row, so they cannot disagree. */
    const rows = effects.map((e, i) => `
      <label class="effect-row">
        <input type="radio" name="effectPick" value="${e.level}" data-text="${esc(e.text)}"
               id="isun-maker-effect-${i}" />
        <span class="effect-level">${e.level}</span>
        <span class="effect-text">${esc(e.text)}</span>
      </label>`).join("");

    return `<div class="maker-effects">
      <p class="hint">${game.i18n.localize("ISUN.MakerEffectLevelHint")}</p>
      <input type="search" class="effect-search"
             placeholder="${game.i18n.localize("ISUN.Search")}" />
      <div class="effect-rows">${rows}</div>

      <!-- Outside the list, because it is not one of the book's effects and no
           search should ever take it away. The books say the lists are examples
           and a table that wants an effect nobody printed should not be stopped
           by this dialog. -->
      <div class="effect-row effect-custom">
        <input type="radio" name="effectPick" value="custom" id="isun-maker-effect-custom" />
        <label for="isun-maker-effect-custom">${game.i18n.localize("ISUN.MakerEffectNotListed")}</label>
        <input type="number" name="effectLevel" value="1" min="1" />
      </div>
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

    /* Whichever control the form was drawn with. A picked row carries its own
     * level; the line at the foot of the list, and the bare field a world
     * without the table gets, carry the typed one. */
    const effectLevel = () => {
      const picked = root.querySelector('input[name="effectPick"]:checked');
      return picked && picked.value !== "custom" ? Number(picked.value) || 0 : num("effectLevel");
    };

    this.#filter(root);

    const update = () => {
      const spec = {
        effectLevel: effectLevel(),
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
   * Searching the effects, done in place.
   *
   * Rows are hidden rather than rebuilt so a picked effect survives a change of
   * filter — the same reason the flux picker does it that way, and the same
   * mistake it would be to lose somebody's choice because they went looking for
   * something else and came back.
   */
  static #filter(root) {
    const search = root.querySelector(".effect-search");
    if (!search) return;

    /* Scoped to the list: the line at the foot is an .effect-row too, and is
     * never what a search is searching. */
    const rows = [...root.querySelectorAll(".effect-rows .effect-row")];
    search.addEventListener("input", () => {
      const needle = search.value.trim().toLowerCase();
      for (const row of rows) {
        row.classList.toggle("hidden", !!needle && !row.textContent.toLowerCase().includes(needle));
      }
    });

    /* Typing a level into the last line is choosing it. Anything else would
     * have a Maker set the number and wonder why the reckoning ignored them. */
    const custom = root.querySelector('.effect-custom input[name="effectLevel"]');
    const pick = root.querySelector('input[name="effectPick"][value="custom"]');
    custom?.addEventListener("input", () => { if (pick) pick.checked = true; });
  }

  /**
   * Put the work on the bench.
   *
   * The deliberate flaws are seeded onto the work as flaws, because that is what
   * they are: "side effects can affect the final value of an item (almost
   * certainly lowering it), but they do not change its final level". Agreeing to
   * one in advance buys an easier process, not a cleaner item.
   *
   * And they are rolled here rather than left as a number, because a price
   * agreed in advance should be a price the Maker can see. Two minor flaws is a
   * quantity; "it hums audibly whenever it is used" is a decision.
   */
  static async #start(actor, form) {
    /* Either control the form was drawn with. A row picked off the table
     * carries its own level; the line at the foot of the list, and the bare
     * field in a world without the table, carry the typed one. */
    const picked = form.effectPick && form.effectPick !== "custom"
      ? Number(form.effectPick) : Number(form.effectLevel);

    const spec = {
      effectLevel: Math.max(1, picked || 1),
      kind: form.kind || "object0to4",
      minor: Math.max(0, Number(form.minor) || 0),
      major: Math.max(0, Number(form.major) || 0)
    };
    const { level, inProcess } = matrix.craftLevel(spec);
    const state = matrix.begin({
      level, inProcess, shaved: Math.max(0, Number(form.shaved) || 0)
    });

    /* One at a time and awaited, because each posts its own card and two rolled
     * at once would reach the log in whichever order they finished. */
    const sideEffects = [];
    for (const severity of [...Array(spec.minor).fill("minor"),
                            ...Array(spec.major).fill("major")]) {
      sideEffects.push({ severity, text: await this.#roll({ role: "sideEffects", severity }) });
    }

    const making = {
      ...state,
      /* The Maker's own words for it, or the line they picked off the table
       * when they did not trouble to write their own. */
      effect: String(form.effect ?? "").trim() || String(form.pickedText ?? "").trim(),
      effectLevel: spec.effectLevel,
      kind: spec.kind,
      startedDay: actor.system?.meta?.day ?? 0,
      sideEffects
    };

    await actor.update({ system: { making } });
    ui.notifications?.info(game.i18n.format("ISUN.MakerBegun",
      { effect: making.effect || game.i18n.localize("ISUN.BenchUnnamed"), level }));
    return making;
  }
}
