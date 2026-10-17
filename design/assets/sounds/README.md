# Sound sources

highsea's sounds are synthesized, not recorded, so their source is data, not audio.

- **Source:** the default pack ("Felt") is a recipe in [`packages/tokens/src/sound/pack.ts`](../../../packages/tokens/src/sound/pack.ts). Each event combines a tiny noise transient with a low-passed triangle tone. The character and rules are in [design language › sound](../../../docs/design-language/sound.md).
- **Web:** clients synthesize the recipe at runtime with Web Audio.
- **Native:** clients play files. [`packages/brand/sounds/`](../../../packages/brand/sounds) holds the default pack rendered to 48 kHz, 16-bit mono WAV by the offline renderer in `@highsea/tokens`. That renderer mirrors the Web Audio graph and matches the browser within 3ms of audible length.

To change a sound:
1. Edit the recipe.
2. Run `bun test` in `packages/tokens` to check the loudness and length rules.
3. Run `bun run build` in `packages/brand` to re-render the files.

No sampled or third-party audio is used.
