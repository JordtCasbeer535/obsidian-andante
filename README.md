# Andante

A practice metronome for Obsidian. An instrument-style tempo dial, precise audio timing, and useful practice controls, right in your sidebar. Follows light and dark themes. The interface is always in English, regardless of the Obsidian or system language.

## Features

- **Tempo:** 30–240 BPM. Type the value, drag the slider, use ±1 steppers, or tap your tempo. Shift-click the steppers for ±5.
- **Rhythm:** 1–8 quarter-note beats per measure. Click any numbered beat to cycle through accent, normal, and mute. Muted beats keep their visual pulse and silence their subdivisions.
- **Subdivisions:** quarter notes, eighth notes, triplets, or sixteenth notes. Subdivision clicks are quieter than the main beat. Changes apply at the next main beat.
- **Sound:** Click, Wood, and Soft, plus a volume slider and one-click mute. The visual metronome continues at zero volume.
- **Practice sessions:** elapsed time for open-ended practice, or a 1, 3, 5, 10, 15, or 30 minute countdown that stops playback automatically. Shows the current measure count and session progress. Each start begins a new session; stopping keeps its time visible.
- **Presets:** Warm-up, Waltz, and Precision, plus up to 12 named presets of your own. Saved presets include tempo, beats, accents/rests, subdivision, and sound. Volume and practice duration stay as you set them. Applying a preset during playback starts a fresh session.
- **Controls:** ribbon icon and commands for opening, starting/stopping, increasing/decreasing tempo, and tap tempo. While the panel is focused, use Space to play/stop, ↑/↓ to adjust tempo (Shift for ±5), and T to tap. Focused buttons retain their normal Space activation; text fields and selectors retain their native keys.

All sounds are synthesized locally through Web Audio; no audio assets or network requests are needed. Sound is scheduled ahead of the UI using the audio clock. Closing the view or disabling the plugin stops playback and clears pending timers.

## Install

Search for **Andante** in Obsidian's community plugin browser.

For a manual install, place `main.js`, `manifest.json`, and `styles.css` from a release in `<vault>/.obsidian/plugins/andante/`, then enable Andante under Settings → Community plugins. When updating, keep your existing `data.json`; it contains your settings and presets. Settings from 1.0.x migrate automatically, including an unaccented downbeat.

Minimum supported Obsidian version: 1.4.0. The newer API used for revealing deferred sidebar views has a compatibility fallback.

## Development

```bash
npm ci
npm run dev      # watch mode
npm run build    # production build, including TypeScript checks
npm test         # sidebar activation, settings migration and audio scheduling regressions
```

Before publishing, verify both themes and narrow/wide sidebars, then test direct BPM input, subdivisions, beat accents/rests, mute/unmute, timed completion, and preset save/reload/apply. Test mobile and the minimum supported Obsidian version separately.

## License

MIT
