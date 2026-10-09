# Andante

An elegant metronome for Obsidian. Precise timing, quiet design — it lives in your sidebar and follows your theme.

## Features

- Tempo from 30 to 240 BPM, with tap tempo and fine steppers
- Time signatures: 1–8 beats per measure, with an accented downbeat
- Two synthesized timbres (Click / Woodblock) — no audio files needed
- Volume control, beat dots that track the measure
- Sample-accurate scheduling via the Web Audio API lookahead pattern
- Ribbon icon, commands (`Open metronome`, `Start/stop metronome`), and a settings tab

## Install

**From the community plugins browser** (once approved): search for "Andante".

**Manual install:** download `main.js`, `manifest.json`, and `styles.css` from the latest release, and place them in `<vault>/.obsidian/plugins/andante/`. Then enable Andante under Settings → Community plugins.

## Development

```bash
npm install
npm run dev      # watch mode
npm run build    # production build (runs typecheck first)
```

## License

MIT
