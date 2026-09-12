const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;
import { ActorSheetMixin } from "./SheetMixin.mjs";

/**
 * The shape both non-player sheets share: a creature and an NPC.
 *
 * Taller and a little wider than the 600 square it was. These are one scrolling
 * column now rather than a tabbed sheet, and a printed entry is longer than it
 * looks — 303 of the 306 imported carry a defence profile and a list of named
 * powers, up to eight of them, before the description starts. At 600 high the
 * Traits line, which is the last thing in the book's own layout and the first
 * thing a GM reaches for when playing the thing, was always below the fold.
 */
export class ISUNSimpleActorSheet extends ActorSheetMixin(HandlebarsApplicationMixin(ActorSheetV2)) {
  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["invisible-sun", "sheet", "actor"],
    position: { width: 640, height: 780 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false }
  };
}
