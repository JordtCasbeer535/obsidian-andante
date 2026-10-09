import type { SoundKind } from "./engine";

export interface AndanteSettings {
	bpm: number;
	beats: number;
	volume: number; // 0..1
	accent: boolean;
	sound: SoundKind;
}

export const DEFAULT_SETTINGS: AndanteSettings = {
	bpm: 100,
	beats: 4,
	volume: 0.8,
	accent: true,
	sound: "click",
};

export const MIN_BPM = 30;
export const MAX_BPM = 240;
export const MIN_BEATS = 1;
export const MAX_BEATS = 8;

export function clampBpm(v: number): number {
	return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(v)));
}

export function clampBeats(v: number): number {
	return Math.min(MAX_BEATS, Math.max(MIN_BEATS, Math.round(v)));
}
