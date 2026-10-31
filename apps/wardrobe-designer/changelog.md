# Wardrobe Designer changelog

What changed in each Wardrobe Designer release, for players. The release workflow (`.github/workflows/release-wardrobe.yml`) takes the GitHub release notes and the Nexus Mods changelog from the section for the version in `rednode-app.json` (`tools/release/notes.mjs --wardrobe`).

How to keep it, as EDGEmat's own changelog (`docs/changelog.md`):

- With each change a player would notice, add a line under **Unreleased**, in its group: **New**, **Changed**, **Fixed** or **Other**.
- Before a release, raise `version` in `rednode-app.json` and `package.json`, rename **Unreleased** to `## <version> (<date>)`, and start a new empty **Unreleased** above it. The release workflow stops if the version has no section, or if anything is left under **Unreleased**.

## Unreleased

**New**

- The first preview. Restyle what V wears in your own words, from the inventory screen. Press a slot (Head, Face, Outer torso, Inner torso, Legs, Feet, Outfit) to pick what V wears there, type how it should look ("red leather", "yellow denim", "make it glossier") and press **Restyle**: REDagent plans the change on the garment's own layers, EDGEmat makes the materials, and REDnode swaps them into the game. V and the inventory's preview show it within seconds, with no restart.
- A second restyle builds on the first. Words that name a material ("denim", "leather") change every layer of the old one; colors and finishes take the closest the game's surface has.
- **Restore** puts an item back to the game's own look. A **\*** marks the items you restyled.
- Restyles stay after a restart: they are one archive, `WardrobeDesigner.archive`, in the game's `archive\pc\mod` folder.
- The first time, it builds EDGEmat's material library from your game (about half a minute), and again after a game update. No VS Code needed.

**Other**

- Patterns and prints ("polka dots", "camo") are not supported yet: you get the base color, and REDagent's note says so.
- Everyone who wears the same look of an item changes too, NPCs included, since the restyle replaces the item's mesh.
