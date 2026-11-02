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
- **Patterns and prints**: "yellow with large black polka dots", "red and black tartan", "woodland camo". REDagent picks the material the pattern goes on and its size, Google Gemini makes the pattern as a texture with your own key and credits, and it goes over that whole material with the garment's folds kept. Plain words afterwards ("red leather") take the pattern off again. The first time, REDnode asks for your Gemini key in its own window (aistudio.google.com > Get API key); it stays in REDnode's Keys for every EDGE tool. "Make the dots bigger" or "make it glossy" keeps the same picture and changes only its size or shine, with no new image and no cost; a picture that already tiles is used as it is, so dots stay sharp up to the edges.

**Other**

- A pattern covers the whole material it goes on, over the material's other layers (trims, dirt and wear on it). A logo or a picture in one place is not supported yet.
- Everyone who wears the same look of an item changes too, NPCs included, since the restyle replaces the item's mesh.
