import type { BeatKind, Subdivision } from "./settings";

export type SoundKind = "click" | "woodblock" | "soft";

export interface EngineOptions {
	getBpm: () => number;
	getBeats: () => number;
	getVolume: () => number;
	getBeatKind: (beat: number) => BeatKind;
	getSubdivision: () => Subdivision;
	getSound: () => SoundKind;
	getDurationSeconds: () => number;
}

/** Web Audio schedules sound ahead of the UI, including quiet subdivision clicks. */
export class MetronomeEngine {
	onPulse: (beat: number, part: number, parts: number) => void = () => undefined;
	onFinish: () => void = () => undefined;
	private ctx: AudioContext | null = null;
	private master: GainNode | null = null;
	private timer: number | null = null;
	private visualTimers = new Set<number>();
	private nextTime = 0;
	private startTime = 0;
	private endTime = Infinity;
	private stoppedElapsed = 0;
	private beat = 0;
	private part = 0;
	private parts = 1;
	private running = false;

	constructor(private opts: EngineOptions) {}

	get isRunning(): boolean { return this.running; }
	get elapsedSeconds(): number {
		return this.ctx && this.running
			? Math.max(0, Math.min(this.ctx.currentTime, this.endTime) - this.startTime)
			: this.stoppedElapsed;
	}

	async start(): Promise<boolean> {
		if (this.running) return false;
		const AC: typeof AudioContext = window.AudioContext ||
			(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
		if (!AC) throw new Error("Web Audio is unavailable");
		const ctx = new AC();
		this.ctx = ctx;
		this.running = true;
		this.stoppedElapsed = 0;
		this.startTime = Infinity;
		try {
			if (ctx.state === "suspended") await ctx.resume();
			// A stop or close may have occurred while the audio device was waking up.
			if (this.ctx !== ctx || !this.running) return false;
			this.master = ctx.createGain();
			this.master.connect(ctx.destination);
			this.beat = 0;
			this.part = 0;
			this.startTime = ctx.currentTime + 0.08;
			this.nextTime = this.startTime;
			const duration = this.opts.getDurationSeconds();
			this.endTime = duration > 0 ? this.startTime + duration : Infinity;
			this.timer = window.setInterval(() => this.tick(), 25);
			this.tick();
			return true;
		} catch (error) {
			if (this.ctx === ctx) this.stop();
			throw error;
		}
	}

	stop(): void {
		this.stoppedElapsed = this.elapsedSeconds;
		this.running = false;
		if (this.timer !== null) window.clearInterval(this.timer);
		this.timer = null;
		for (const timer of this.visualTimers) window.clearTimeout(timer);
		this.visualTimers.clear();
		if (this.ctx) void this.ctx.close().catch(() => undefined);
		this.ctx = null;
		this.master = null;
	}

	resetElapsed(): void {
		if (!this.running) this.stoppedElapsed = 0;
	}

	private tick(): void {
		if (!this.ctx || !this.master || !this.running) return;
		if (this.ctx.currentTime >= this.endTime) {
			this.stop();
			this.onFinish();
			return;
		}
		this.master.gain.setValueAtTime(Math.min(1, Math.max(0, this.opts.getVolume())), this.ctx.currentTime);
		// Resume on a fresh measure after a long suspension, without a burst of overdue clicks.
		if (this.nextTime < this.ctx.currentTime - 0.15) {
			this.nextTime = this.ctx.currentTime + 0.02;
			this.beat = this.part = 0;
		}
		// Repeated fractional intervals can land a fraction of a nanosecond before
		// the deadline. Treat that as the boundary, rather than starting a new measure.
		while (this.nextTime < this.ctx.currentTime + 0.15 && this.nextTime < this.endTime - 1e-7) {
			if (this.part === 0) this.parts = this.opts.getSubdivision();
			this.beat %= Math.max(1, this.opts.getBeats());
			const beat = this.beat, part = this.part, parts = this.parts, when = this.nextTime;
			this.playClick(this.opts.getBeatKind(beat), part, when);
			const ctx = this.ctx;
			const timer = window.setTimeout(() => {
				this.visualTimers.delete(timer);
				if (this.running && this.ctx === ctx) this.onPulse(beat, part, parts);
			}, Math.max(0, (when - ctx.currentTime) * 1000));
			this.visualTimers.add(timer);
			this.nextTime += 60 / Math.min(240, Math.max(30, this.opts.getBpm())) / this.parts;
			this.part++;
			if (this.part === this.parts) {
				this.part = 0;
				this.beat = (this.beat + 1) % Math.max(1, this.opts.getBeats());
			}
		}
	}

	private playClick(kind: BeatKind, part: number, when: number): void {
		if (!this.ctx || !this.master || kind === "mute") return;
		const accented = part === 0 && kind === "accent";
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();
		const sound = this.opts.getSound();
		osc.type = sound === "woodblock" ? "triangle" : "sine";
		const base = sound === "woodblock" ? 830.6 : sound === "soft" ? 660 : 1174.7;
		osc.frequency.setValueAtTime(base * (accented ? 1.5 : part > 0 ? 0.75 : 1), when);
		const peak = part > 0 ? 0.22 : accented ? 0.85 : 0.55;
		const tail = sound === "soft" ? 0.065 : 0.09;
		gain.gain.setValueAtTime(0.0001, when);
		gain.gain.exponentialRampToValueAtTime(peak, when + 0.003);
		gain.gain.exponentialRampToValueAtTime(0.0001, when + tail);
		osc.connect(gain);
		gain.connect(this.master);
		osc.onended = () => { osc.disconnect(); gain.disconnect(); };
		osc.start(when);
		osc.stop(when + tail + 0.01);
	}
}
