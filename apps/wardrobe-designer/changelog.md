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
- **Patterns and prints**: "yellow with large black polka dots", "red and black tartan", "woodland camo". REDagent picks the material the pattern goes on and its size, OpenAI's GPT Image makes the pattern as a texture with your own key and credits, and it goes over that whole material with the garment's folds kept. Plain words afterwards ("red leather") take the pattern off again. The first time, REDnode asks for your OpenAI key in its own window (platform.openai.com > API keys); it stays in REDnode's Keys for every EDGE tool. **Patterns: GPT Image** switches to Google Gemini (and back), for a Gemini key instead. "Make the dots bigger" or "make it glossy" keeps the same picture and changes only its size or shine, with no new image and no cost; a picture that already tiles is used as it is, so dots stay sharp up to the edges. With Gemini, its newest full image model makes the pattern (Nano Banana 2), not its Lite one.

- **Reshape** (a first version): change a piece of clothing's shape by words, such as "make the brim twice as wide". Press **Reshape** to see it drawn from four sides, type the change and press **Change**: OpenAI's GPT Image changes the pictures with your own key. Change again to build on it, or **Back** to take a change away. **Make it** (press twice: it spends about 60 of your Tripo credits, about 4 minutes) has Tripo make the 3D model, fits it on V and swaps it in; **Restore** takes it away. Only clothing that moves with one bone (hats, helmets, glasses) can be made so far; other clothing can be changed in pictures and says why it cannot be made yet. The pictures show in the window side by side, as it is and changed, and a click opens one larger.
- **Your keys first**: while a key the app uses is missing, the window opens on **your keys**, each key Ready or Needed with **Set**, which opens REDnode's own window to type it in. Once every key is ready it goes on to the main view by itself (or **Continue without them**). The **Keys** button comes back to it any time.
- **Equipment-EX**: the window lists what V visibly wears, one button for each piece, including the clothing Equipment-EX wears in its own slots (two torso layers, a necklace, gloves). Before, it read the game's base slots, which Equipment-EX hides. The app uses an OpenAI key (patterns and Reshape's pictures) and a Tripo key (Reshape's models); REDagent keeps its own Anthropic key.

**Other**

- Needs REDnode 0.56.1 or later: the first REDnode that knows the Tripo key and shows pictures in a window.

- A pattern covers the whole material it goes on, over the material's other layers (trims, dirt and wear on it). A logo or a picture in one place is not supported yet.
- Everyone who wears the same look of an item changes too, NPCs included, since the restyle replaces the item's mesh.
