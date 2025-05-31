import {
    onManageActiveEffect,
    prepareActiveEffectCategories,
} from "../helpers/effects.mjs";

/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export class InvisibleSunActorSheet extends ActorSheet {
    /** @override */
    static get defaultOptions() {
        // let newoptions = super.defaultOptions;
        // newoptions.dragDrop.push({
        //     dragSelector: ".item",
        //     dropSelector: ".item",
        //     hoverClass: "drop-target",
        //     activeClass: "dropped",
        // });
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["invisiblesun", "sheet", "actor"],
            template: "systems/invisible-sun/templates/actor/actor-sheet.html",
            width: 600,
            height: 600,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "features",
                },
            ],
        });
    }

    /** @override */
    get template() {
        return `systems/invisible-sun/templates/actor/actor-${this.actor.type}-sheet.html`;
    }

    /* -------------------------------------------- */

    /** @override */
    getData() {
        // Retrieve the data structure from the base sheet. You can inspect or log
        // the context variable to see the structure, but some key properties for
        // sheets are the actor object, the data object, whether or not it's
        // editable, the items array, and the effects array.
        const context = super.getData();

        // Use a safe clone of the actor data for further operations.
        const actorData = this.actor.toObject(false);

        // Add the actor's data to context.data for easier access, as well as flags.
        context.system = actorData.system;
        context.flags = actorData.flags;

        // Prepare vislae data and items.
        if (actorData.type == "vislae") {
            this._prepareItems(context);
            this._prepareVislaeData(context);
        }

        // Prepare NPC data and items.
        if (actorData.type == "npc") {
            this._prepareItems(context);
        }

        // Add roll data for TinyMCE editors.
        context.rollData = context.actor.getRollData();

        // Prepare active effects
        context.effects = prepareActiveEffectCategories(this.actor.effects);

        return context;
    }

    /**
     * Organize and classify Items for Vislae sheets.
     *
     * @param {Object} actorData The actor to prepare.
     *
     * @return {undefined}
     */
    _prepareVislaeData(context) {
        // Handle ability scores.
        // for (let [k, v] of Object.entries(context.system.abilities)) {
        //   v.label = game.i18n.localize(CONFIG.INVISIBLESUN.abilities[k]) ?? k;
        // }
        for (let key in context.system.statistics) {
            for (let [k, v] of Object.entries(
                context.system.statistics[key].pool
            )) {
                v.label =
                    game.i18n.localize(CONFIG.INVISIBLESUN.abilities[k]) ?? k;
            }
        }
    }

    /**
     * Organize and classify Items for Vislae sheets.
     *
     * @param {Object} actorData The actor to prepare.
     *
     * @return {undefined}
     */
    _prepareItems(context) {
        // Initialize containers.
        const gear = [];
        const features = [];
        const spells = {
            0: [],
            1: [],
            2: [],
            3: [],
            4: [],
            5: [],
            6: [],
            7: [],
            8: [],
            9: [],
        };
        let aOrAn = "A";
        let testament = {
            foundation: [],
            heart: [],
            order: [],
            forte: [],
        };

        // Iterate through items, allocating to containers
        for (let i of context.items) {
            i.img = i.img || DEFAULT_TOKEN;
            // Append to gear.
            if (i.type === "item") {
                gear.push(i);
            }
            // Append to features.
            else if (i.type === "feature") {
                features.push(i);
            }
            // Append to spells.
            else if (i.type === "spell") {
                if (i.system.spellLevel != undefined) {
                    spells[i.system.spellLevel].push(i);
                }
            }
            // Append to testament
            else if (
                i.type === "foundation" ||
                i.type === "heart" ||
                i.type === "order" ||
                i.type === "forte"
            ) {
                if (testament[i.type].length === 0) {
                    // If this is the first foundation, add it to the array.
                    testament[i.type].push(i);
                } else if (
                    i._stats.createdTime >
                    testament[i.type][0]._stats.createdTime
                ) {
                    // If this foundation is newer than the first, remove the first and add this one.
                    testament[i.type].splice(0, 1);
                    testament[i.type].push(i);
                } else {
                    // If this foundation is older than the first, remove this one.
                    let index = context.items.indexOf(i);
                    context.items.splice(index, 1);
                }
            }
        }

        // Check if the first foundation starts with a vowel.
        // If it does, set aOrAn to "An", otherwise set it to "A".
        let vowels = ["a", "e", "i", "o", "u"];
        if (testament.foundation.length > 0) {
            if (
                vowels.includes(testament.foundation[0].name[0].toLowerCase())
            ) {
                aOrAn = "An";
            }
        } else {
            aOrAn = "A";
        }

        // Assign and return
        context.gear = gear;
        context.features = features;
        context.spells = spells;
        context.foundations = testament.foundation;
        context.hearts = testament.heart;
        context.orders = testament.order;
        context.fortes = testament.forte;
        context.aOrAn = aOrAn;
    }

    /* -------------------------------------------- */

    /** @override */
    activateListeners(html) {
        super.activateListeners(html);

        // Render the testament sheet for viewing/editing.
        html.find(".testament-sheet").click((ev) => {
            const item = $(ev.currentTarget);
            const testament = this.actor.items.get(item.data("itemId"));
            testament.sheet.render(true);
        });

        // Render the item sheet for viewing/editing prior to the editable check.
        html.find(".item-edit").click((ev) => {
            const li = $(ev.currentTarget).parents(".item");
            const item = this.actor.items.get(li.data("itemId"));
            item.sheet.render(true);
        });

        // -------------------------------------------------------------
        // Everything below here is only needed if the sheet is editable
        if (!this.isEditable) return;

        // Add Inventory Item
        html.find(".item-create").click(this._onItemCreate.bind(this));

        // Delete Inventory Item
        html.find(".item-delete").click((ev) => {
            const li = $(ev.currentTarget).parents(".item");
            const item = this.actor.items.get(li.data("itemId"));
            item.delete();
            li.slideUp(200, () => this.render(false));
        });

        // Active Effect management
        html.find(".effect-control").click((ev) =>
            onManageActiveEffect(ev, this.actor)
        );

        // Rollable abilities.
        html.find(".rollable").click(this._onRoll.bind(this));

        // Drag events for macros.
        if (this.actor.isOwner) {
            let handler = (ev) => this._onDragStart(ev);
            html.find("li.item").each((i, li) => {
                if (li.classList.contains("inventory-header")) return;
                li.setAttribute("draggable", true);
                li.addEventListener("dragstart", handler, false);
            });
        }
    }

    /**
     * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset
     * @param {Event} event   The originating click event
     * @private
     */
    async _onItemCreate(event) {
        event.preventDefault();
        const header = event.currentTarget;
        // Get the type of item to create.
        const type = header.dataset.type;
        // Grab any data associated with this control.
        const data = foundry.utils.duplicate(header.dataset);
        // Initialize a default name.
        const name = `New ${type.capitalize()}`;
        // Prepare the item object.
        const itemData = {
            name: name,
            type: type,
            system: data,
        };
        // Remove the type from the dataset since it's in the itemData.type prop.
        delete itemData.system["type"];

        // Finally, create the item!
        return await Item.create(itemData, { parent: this.actor });
    }

    /**
     * Handle clickable rolls.
     * @param {Event} event   The originating click event
     * @private
     */
    _onRoll(event) {
        event.preventDefault();
        const element = event.currentTarget;
        const dataset = element.dataset;

        // Handle item rolls.
        if (dataset.rollType) {
            if (dataset.rollType == "item") {
                const itemId = element.closest(".item").dataset.itemId;
                const item = this.actor.items.get(itemId);
                if (item) return item.roll();
            }
        }

        // Handle rolls that supply the formula directly.
        if (dataset.roll) {
            let label = dataset.label ? `[ability] ${dataset.label}` : "";
            let roll = new Roll(dataset.roll, this.actor.getRollData());
            roll.toMessage({
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                flavor: label,
                rollMode: game.settings.get("core", "rollMode"),
            });
            return roll;
        }
    }
}
