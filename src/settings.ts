import type { SoundKind } from "./engine";

export type BeatKind = "accent" | "normal" | "mute";
export type Subdivision = 1 | 2 | 3 | 4;

export interface RhythmPreset {
	id: string;
	name: string;
	bpm: number;
	beats: number;
	subdivision: Subdivision;
	beatPattern: BeatKind[];
	sound: SoundKind;
}

export interface AndanteSettings {
	bpm: number;
	beats: number;
	volume: number;
	sound: SoundKind;
	subdivision: Subdivision;
	beatPattern: BeatKind[];
	sessionMinutes: number;
	presets: RhythmPreset[];
}

export const MIN_BPM = 30;
export const MAX_BPM = 240;
export const MIN_BEATS = 1;
export const MAX_BEATS = 8;
export const MAX_PRESETS = 12;
export const SESSION_OPTIONS = [0, 1, 3, 5, 10, 15, 30];

export const DEFAULT_SETTINGS: AndanteSettings = {
	bpm: 100, beats: 4, volume: 0.8, sound: "click", subdivision: 1,
	beatPattern: ["accent", "normal", "normal", "normal"],
	sessionMinutes: 0, presets: [],
};

function finite(v: unknown, fallback: number): number {
	return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function clampBpm(v: number): number {
	return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(finite(v, 100))));
}

export function clampBeats(v: number): number {
	return Math.min(MAX_BEATS, Math.max(MIN_BEATS, Math.round(finite(v, 4))));
}

export function normalizeSubdivision(v: unknown): Subdivision {
	return v === 2 || v === 3 || v === 4 ? v : 1;
}

export function normalizeSound(v: unknown): SoundKind {
	return v === "woodblock" || v === "soft" ? v : "click";
}

export function resizePattern(pattern: unknown, beats: number, accent = true): BeatKind[] {
	const values: unknown[] = Array.isArray(pattern) ? pattern : [];
	return Array.from({ length: clampBeats(beats) }, (_, i) => {
		const v = values[i];
		return v === "normal" || v === "mute" || v === "accent" ? v : i === 0 && accent ? "accent" : "normal";
	});
}

function record(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

/** Migrate 1.0.x downbeat settings and validate data from older or edited files. */
export function normalizeSettings(data: unknown): AndanteSettings {
	const v = record(data);
	const beats = clampBeats(finite(v.beats, 4));
	const ids = new Set<string>();
	const presets: RhythmPreset[] = [];
	for (const item of Array.isArray(v.presets) ? v.presets : []) {
		const p = record(item);
		if (typeof p.id !== "string" || !p.id || p.id.startsWith("builtin-") || ids.has(p.id)) continue;
		if (typeof p.name !== "string" || !p.name.trim()) continue;
		const id = p.id.slice(0, 80);
		if (ids.has(id)) continue;
		const count = clampBeats(finite(p.beats, 4));
		presets.push({ id, name: p.name.trim().slice(0, 40), bpm: clampBpm(finite(p.bpm, 100)),
			beats: count, subdivision: normalizeSubdivision(p.subdivision),
			beatPattern: resizePattern(p.beatPattern, count), sound: normalizeSound(p.sound) });
		ids.add(id);
		if (presets.length === MAX_PRESETS) break;
	}
	return {
		bpm: clampBpm(finite(v.bpm, 100)), beats,
		volume: Math.min(1, Math.max(0, finite(v.volume, 0.8))),
		sound: normalizeSound(v.sound), subdivision: normalizeSubdivision(v.subdivision),
		beatPattern: resizePattern(v.beatPattern, beats, v.accent !== false),
		sessionMinutes: SESSION_OPTIONS.includes(v.sessionMinutes as number) ? v.sessionMinutes as number : 0,
		presets,
	};
}

export const BUILTIN_PRESETS: RhythmPreset[] = [
	{ id: "builtin-warmup", name: "warmup", bpm: 72, beats: 4, subdivision: 1,
		beatPattern: ["accent", "normal", "normal", "normal"], sound: "woodblock" },
	{ id: "builtin-waltz", name: "waltz", bpm: 96, beats: 3, subdivision: 2,
		beatPattern: ["accent", "normal", "normal"], sound: "click" },
	{ id: "builtin-focus", name: "focus", bpm: 120, beats: 4, subdivision: 4,
		beatPattern: ["accent", "normal", "normal", "normal"], sound: "soft" },
];
