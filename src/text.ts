const en = {
	studio: "PRACTICE STUDIO", ready: "Ready", playing: "Playing", complete: "Complete", stopped: "Stopped",
	tempo: "Tempo", editTempo: "Enter tempo in BPM", bpm: "BPM", start: "Start metronome", stop: "Stop metronome",
	startShort: "Start", stopShort: "Stop", decrease: "Decrease tempo", increase: "Increase tempo",
	tap: "Tap tempo", tapHint: "Tap to find your pace", keyboard: "Space · play / stop   ↑ ↓ · tempo   T · tap",
	rhythm: "Rhythm", perMeasure: "Beats / measure", fewer: "Fewer beats per measure", more: "More beats per measure",
	subdivision: "Subdivision", quarter: "Quarter", eighth: "Eighth", triplet: "Triplet", sixteenth: "16th",
	beat: "Beat", accent: "Accent", normal: "Normal", mute: "Mute", beatHint: "Click a beat: accent → normal → mute",
	patternReset: "Reset beat accents", sound: "Sound", click: "Click", woodblock: "Wood", soft: "Soft",
	volume: "Volume", muteAudio: "Mute audio", unmuteAudio: "Unmute audio", session: "Practice session",
	duration: "Duration", unlimited: "Open-ended", minutes: "min", elapsed: "Elapsed", remaining: "Remaining",
	measures: "Measures", nextSession: "Choose a duration before starting. The timer stops playback automatically.",
	presets: "Presets", choosePreset: "Choose a preset…", builtins: "Ready-made", saved: "Your presets",
	warmup: "Warm-up · 72 BPM", waltz: "Waltz · 96 BPM", focus: "Precision · 120 BPM",
	savePreset: "Save current rhythm", removePreset: "Remove selected preset", presetName: "Preset name",
	namePlaceholder: "e.g. Scales in 3/4", save: "Save", cancel: "Cancel", presetSaved: "Preset saved",
	presetRemoved: "Preset removed", presetLimit: "You can save up to 12 presets. Remove one to make space.",
	deleteConfirm: "Remove preset", delete: "Remove", audioError: "Unable to start audio. Check your audio output and try again.",
	settingsIntro: "Tempo, rhythm, sound and sessions are available directly in the Andante sidebar.",
	defaultTempo: "Tempo", tempoDesc: "30–240 beats per minute. Changes also update the open sidebar.",
	beatsDesc: "1–8 beats per measure. Click individual beats in the sidebar to set accents and rests.",
	soundDesc: "Three synthesized sounds; no downloads or audio files required.",
	volumeDesc: "Set click loudness. At zero volume, the visual metronome keeps running.",
	subdivisionDesc: "Add quieter, evenly spaced clicks between main beats.",
	durationDesc: "Open-ended sessions count up; timed sessions stop automatically.",
};

export type TextKey = keyof typeof en;
export function t(key: TextKey): string {
	return en[key];
}
