// /**
//  * The Invisible Sun game system for FoundryVTT
//  *
//  * Author: Darryn van Someren
//  * Repository: https://github.com/DeviousDVS/is-vtt.git
//  * Software License: MIT
//  * Content License:
//  *
//  */

// import "./scss/fatex.scss";

// import { FateX } from "./config";
// import { ActorFate } from "./module/actor/ActorFate";
import { CharacterSheet } from "../templates/actor/vislae.html";
// import { HandlebarsHelpers } from "./module/helper/HandlebarsHelpers";
// import { TemplatePreloader } from "./module/helper/TemplatePreloader";
// import { AspectSheet } from "./module/item/aspect/AspectSheet";
// import { ConsequenceSheet } from "./module/item/consequence/ConsequenceSheet";
// import { ExtraSheet } from "./module/item/extra/ExtraSheet";
// import { ItemFate } from "./module/item/ItemFate";
// import { SkillSheet } from "./module/item/skill/SkillSheet";
// import { StressSheet } from "./module/item/stress/StressSheet";
// import { StuntSheet } from "./module/item/stunt/StuntSheet";
// import { TemplateActors } from "./module/apps/template-actors/TemplateActors";

// /* -------------------------------- */
// /*	Register hooks      			*/
// /* -------------------------------- */
// TemplateActors.hooks();

// /* -------------------------------- */
// /*	System initialization			*/
// /* -------------------------------- */
// Hooks.once("init", async () => {
//     console.log(`FateX | Initializing Fate extended game system`);

//     // Initialise config
//     CONFIG.FateX = FateX;

//     //@ts-ignore
//     CONFIG.Actor.entityClass = ActorFate;
//     CONFIG.Item.entityClass = ItemFate;

//     CONFIG.FateX.global.useMarkdown = !![...game.modules.values()].filter(
//         (module) => {
//             return module.id === "markdown-editor" && module.active;
//         }
//     ).length;

//     // Preload all needed templates
//     await TemplatePreloader.preloadHandlebarsTemplates();

//     // Register HandlebarsHelpers
//     HandlebarsHelpers.registerHelpers();

//     // Unregister Core sheets
//     Actors.unregisterSheet("core", ActorSheet);
//     Items.unregisterSheet("core", ItemSheet);

// Register FateX actor sheets
Actors.registerSheet("IS", CharacterSheet, {
    types: ["Vislae"],
    makeDefault: true,
});

//     // Register FateX item sheets
//     Items.registerSheet("FateX", StressSheet, {
//         types: ["stress"],
//         makeDefault: true,
//     });

//     Items.registerSheet("FateX", AspectSheet, {
//         types: ["aspect"],
//         makeDefault: true,
//     });

//     Items.registerSheet("FateX", ConsequenceSheet, {
//         types: ["consequence"],
//         makeDefault: true,
//     });

//     Items.registerSheet("FateX", SkillSheet, {
//         types: ["skill"],
//         makeDefault: true,
//     });

//     Items.registerSheet("FateX", StuntSheet, {
//         types: ["stunt"],
//         makeDefault: true,
//     });

//     Items.registerSheet("FateX", ExtraSheet, {
//         types: ["extra"],
//         makeDefault: true,
//     });
// });
