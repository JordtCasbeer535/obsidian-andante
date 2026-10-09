export type SoundKind = "click" | "woodblock";

export interface EngineOptions {
	getBpm: () => number;
	getBeats: () => number;
	getVolume: () => number; // 0..1
	getAccent: () => boolean;
	getSound: () => SoundKind;
}

/**
 * A precise metronome engine built on the Web Audio API.
 *
 * Uses the classic lookahead scheduler pattern: a 25ms timer keeps the
 * audio clock fed ~150ms into the future, so timing stays rock solid
 * regardless of UI thread jitter.
 */
export class MetronomeEngine {
	/** Called on the UI thread, aligned as closely as possible with each audible beat. */
	onBeat: (beatIndex: number) => void = () => undefined;

	private ctx: AudioContext | null = null;
	private master: GainNode | null = null;
	private timer: number | null = null;
	private nextTime = 0;
	private beat = 0;
	private running = false;

	constructor(private opts: EngineOptions) {}

	get isRunning(): boolean {
		return this.running;
	}

	start(): void {
		if (this.running) return;
		const AC: typeof AudioContext =
			window.AudioContext ||
			(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
		this.ctx = new AC();
		if (this.ctx.state === "suspended") void this.ctx.resume();
		this.master = this.ctx.createGain();
		this.master.gain.value = 1;
		this.master.connect(this.ctx.destination);
		this.beat = 0;
		this.nextTime = this.ctx.currentTime + 0.08;
		this.running = true;
		this.timer = window.setInterval(() => this.tick(), 25);
	}

	stop(): void {
		this.running = false;
		if (this.timer !== null) {
			window.clearInterval(this.timer);
			this.timer = null;
		}
		if (this.ctx) {
			this.ctx.close().catch(() => undefined);
			this.ctx = null;
			this.master = null;
		}
	}

	private tick(): void {
		if (!this.ctx || !this.running) return;
		const lookahead = 0.15;
		while (this.nextTime < this.ctx.currentTime + lookahead) {
			const beat = this.beat;
			const when = this.nextTime;
			this.playClick(beat, when);
			// Mirror the audible beat onto the UI thread.
			const delayMs = Math.max(0, (when - this.ctx.currentTime) * 1000);
			const ctx = this.ctx;
			window.setTimeout(() => {
				if (this.running && this.ctx === ctx) this.onBeat(beat);
			}, delayMs);
			this.nextTime += 60 / Math.max(30, this.opts.getBpm());
			this.beat = (this.beat + 1) % Math.max(1, this.opts.getBeats());
		}
	}

	private playClick(beat: number, when: number): void {
		if (!this.ctx || !this.master) return;
		const volume = this.opts.getVolume();
		if (volume <= 0.001) return;

		const accented = beat === 0 && this.opts.getAccent();
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();

		if (this.opts.getSound() === "woodblock") {
			osc.type = "triangle";
			osc.frequency.setValueAtTime(accented ? 1244.5 : 830.6, when); // D#6 / G#5
		} else {
			osc.type = "sine";
			osc.frequency.setValueAtTime(accented ? 1760 : 1174.7, when); // A6 / D6
		}

		const peak = Math.max(0.0011, 0.9 * volume);
		gain.gain.setValueAtTime(0.0001, when);
		gain.gain.exponentialRampToValueAtTime(peak, when + 0.003);
		gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.09);

		osc.connect(gain);
		gain.connect(this.master);
		osc.start(when);
		osc.stop(when + 0.12);
	}
}
