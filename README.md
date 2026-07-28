# Invisible Sun — Foundry VTT System

This is a custom system for playing the **Invisible Sun** roleplaying game (by Monte Cook Games) on [Foundry Virtual Tabletop](https://foundryvtt.com/). Step into the Actuality, a surreal world where ideas have power, magic is real, and the ordinary is extraordinary.

## Features

- **Custom Actor Sheets:** Support for Vislae (player characters), NPCs, and Creatures.
- **Custom Item Sheets:** Comprehensive support for all facets of a Vislae's character and magic, including:
  - **Character Aspects:** Heart, Foundation, Soul, Order, Forte.
  - **Magic & Abilities:** Spells, Incantations, Secrets, Skills, Ephemera, Objects of Power, and Forte Abilities.
  - **Narrative Elements:** Character Arcs and Sooth Cards.
- **Compendium Packs:** Pre-configured packs for Character Arcs, Forte Abilities, Fortes, Foundations, Hearts, Incantations, Orders, Souls, and Spells.
- **Chat Commands:** Built-in hooks for chat commands like `/venture` to trigger dice rolls and magic mechanics directly from the chat.
- **Foundry v14 Support:** Designed and verified for Foundry VTT version 14.

## Installation

### Manual Installation
1. Navigate to your Foundry VTT `Data/systems/` directory.
2. Clone or extract the contents of this repository into a folder named `invisible-sun`.
3. Restart Foundry VTT.
4. When creating a new world in Foundry, select **Invisible Sun** as your game system.

## Development

If you are contributing to the system or looking to modify the compendia, this project includes utility scripts to help manage data.

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed, and install the required dependencies:
```bash
npm install
```

### Managing Compendium Packs
The `scripts/` directory contains tools for packing and unpacking compendium data:
- `build_compendia.js`
- `compile_packs.js`

These scripts utilize the `@foundryvtt/foundryvtt-cli` to help compile your source JSON data into LevelDB packs (and vice versa).

## Compatibility

- **Foundry VTT Minimum Version:** 14.354
- **Foundry VTT Verified Version:** 14.364

## Authors

- **DeviousDVS**

## Legal

*Invisible Sun* and its associated properties are trademarks and copyrights of Monte Cook Games. This system is a community creation designed for playing the game on Foundry VTT and is not officially affiliated with Monte Cook Games.
