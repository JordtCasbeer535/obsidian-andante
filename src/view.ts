import { ItemView, WorkspaceLeaf } from "obsidian";
import { MetronomeEngine } from "./engine";
import { clampBeats, clampBpm, MAX_BPM, MIN_BPM } from "./settings";
import type AndantePlugin from "./main";

export const VIEW_TYPE_ANDANTE = "andante-metronome-view";

const ICON_PLAY =
	'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
const ICON_STOP =
	'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="2"/></svg>';
const ICON_VOLUME =
	'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9.4 9.4 0 0 1 0 13"/></svg>';

/**
 * Attach an inline SVG icon without using innerHTML, so the markup
 * stays inert and passes the community review linter.
 */
function setIcon(el: HTMLElement, svg: string): void {
	el.empty();
	const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
	const node = doc.documentElement;
	if (node) el.appendChild(document.adoptNode(node));
}

export class MetronomeView extends ItemView {
	private engine: MetronomeEngine;
	private bpm: number;
	private beats: number;
	private tapTimes: number[] = [];

	private dotsEl!: HTMLElement;
	private dots: HTMLElement[] = [];
	private bpmNumEl!: HTMLElement;
	private playBtn!: HTMLElement;
	private sliderEl!: HTMLInputElement;
	private beatsNumEl!: HTMLElement;
	private volSliderEl!: HTMLInputElement;
	private saveTimer: number | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: AndantePlugin) {
		super(leaf);
		this.bpm = plugin.settings.bpm;
		this.beats = plugin.settings.beats;
		this.engine = new MetronomeEngine({
			getBpm: () => this.bpm,
			getBeats: () => this.beats,
			getVolume: () => this.plugin.settings.volume,
			getAccent: () => this.plugin.settings.accent,
			getSound: () => this.plugin.settings.sound,
		});
		this.engine.onBeat = (i) => this.flashBeat(i);
	}

	getViewType(): string {
		return VIEW_TYPE_ANDANTE;
	}

	getDisplayText(): string {
		return "Andante";
	}

	getIcon(): string {
		return "timer";
	}

	async onOpen(): Promise<void> {
		const root = this.containerEl.children[1];
		root.empty();
		root.addClass("andante");

		// Beat dots
		this.dotsEl = root.createDiv({ cls: "andante-beats" });
		this.renderDots();

		// Tempo readout
		const tempo = root.createDiv({ cls: "andante-tempo" });
		this.bpmNumEl = tempo.createSpan({ cls: "andante-bpm-num", text: String(this.bpm) });
		tempo.createSpan({ cls: "andante-bpm-unit", text: "BPM" });

		// Tempo slider
		this.sliderEl = root.createEl("input", { cls: "andante-slider" });
		this.sliderEl.type = "range";
		this.sliderEl.min = String(MIN_BPM);
		this.sliderEl.max = String(MAX_BPM);
		this.sliderEl.value = String(this.bpm);
		this.sliderEl.setAttribute("aria-label", "Tempo");
		this.sliderEl.addEventListener("input", () => this.setBpm(Number(this.sliderEl.value), false));

		// Transport: stepper / play / stepper
		const transport = root.createDiv({ cls: "andante-transport" });
		const minus = transport.createEl("button", { cls: "andante-step" });
		minus.setAttribute("aria-label", "Decrease tempo");
		minus.textContent = "−";
		minus.addEventListener("click", () => this.setBpm(this.bpm - 1));

		this.playBtn = transport.createEl("button", { cls: "andante-play" });
		this.playBtn.setAttribute("aria-label", "Start metronome");
		setIcon(this.playBtn, ICON_PLAY);
		this.playBtn.addEventListener("click", () => this.toggle());

		const plus = transport.createEl("button", { cls: "andante-step" });
		plus.setAttribute("aria-label", "Increase tempo");
		plus.textContent = "+";
		plus.addEventListener("click", () => this.setBpm(this.bpm + 1));

		// Tap tempo + beats per measure
		const row = root.createDiv({ cls: "andante-row" });
		const tap = row.createEl("button", { cls: "andante-tap", text: "Tap" });
		tap.setAttribute("aria-label", "Tap tempo");
		tap.addEventListener("click", () => {
			this.tap();
			tap.classList.remove("andante-tap-hit");
			void tap.offsetWidth; // restart animation
			tap.classList.add("andante-tap-hit");
		});

		const beatsCtl = row.createDiv({ cls: "andante-beats-ctl" });
		const bMinus = beatsCtl.createEl("button", { cls: "andante-mini", text: "−" });
		bMinus.setAttribute("aria-label", "Fewer beats per measure");
		bMinus.addEventListener("click", () => this.setBeats(this.beats - 1));
		const beatsWrap = beatsCtl.createDiv({ cls: "andante-beats-num-wrap" });
		this.beatsNumEl = beatsWrap.createSpan({ cls: "andante-beats-num", text: String(this.beats) });
		beatsWrap.createSpan({ cls: "andante-beats-label", text: "beats" });
		const bPlus = beatsCtl.createEl("button", { cls: "andante-mini", text: "+" });
		bPlus.setAttribute("aria-label", "More beats per measure");
		bPlus.addEventListener("click", () => this.setBeats(this.beats + 1));

		// Volume
		const volRow = root.createDiv({ cls: "andante-row andante-vol" });
		const volIcon = volRow.createSpan({ cls: "andante-vol-icon" });
		setIcon(volIcon, ICON_VOLUME);
		this.volSliderEl = volRow.createEl("input", { cls: "andante-slider andante-vol-slider" });
		this.volSliderEl.type = "range";
		this.volSliderEl.min = "0";
		this.volSliderEl.max = "100";
		this.volSliderEl.value = String(Math.round(this.plugin.settings.volume * 100));
		this.volSliderEl.setAttribute("aria-label", "Volume");
		this.volSliderEl.addEventListener("input", () => {
			this.plugin.settings.volume = Number(this.volSliderEl.value) / 100;
			this.scheduleSave();
		});
	}

	async onClose(): Promise<void> {
		this.engine.stop();
		if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
		await this.plugin.saveSettings();
	}

	/** Start or stop the metronome. Called by the play button and the toggle command. */
	toggle(): void {
		if (this.engine.isRunning) this.stop();
		else this.start();
	}

	private start(): void {
		this.engine.start();
		setIcon(this.playBtn, ICON_STOP);
		this.playBtn.setAttribute("aria-label", "Stop metronome");
		this.playBtn.classList.add("andante-playing");
		this.flashBeat(0);
	}

	private stop(): void {
		this.engine.stop();
		setIcon(this.playBtn, ICON_PLAY);
		this.playBtn.setAttribute("aria-label", "Start metronome");
		this.playBtn.classList.remove("andante-playing");
		this.clearDots();
	}

	private setBpm(v: number, syncSlider = true): void {
		this.bpm = clampBpm(v);
		this.bpmNumEl.textContent = String(this.bpm);
		if (syncSlider) this.sliderEl.value = String(this.bpm);
		else if (Number(this.sliderEl.value) !== this.bpm) this.sliderEl.value = String(this.bpm);
		this.plugin.settings.bpm = this.bpm;
		this.scheduleSave();
	}

	private setBeats(v: number): void {
		this.beats = clampBeats(v);
		this.beatsNumEl.textContent = String(this.beats);
		this.renderDots();
		this.plugin.settings.beats = this.beats;
		this.scheduleSave();
	}

	private renderDots(): void {
		this.dotsEl.empty();
		this.dots = [];
		for (let i = 0; i < this.beats; i++) {
			const dot = this.dotsEl.createDiv({ cls: "andante-dot" });
			if (i === 0 && this.plugin.settings.accent && this.beats > 1) {
				dot.addClass("andante-dot-downbeat");
			}
			this.dots.push(dot);
		}
	}

	private clearDots(): void {
		for (const d of this.dots) d.removeClass("andante-dot-on");
	}

	private flashBeat(i: number): void {
		this.clearDots();
		const dot = this.dots[i];
		if (dot) {
			dot.addClass("andante-dot-on");
			// Retrigger the soft pulse on the tempo readout.
			this.bpmNumEl.classList.remove("andante-beat-pulse");
			void this.bpmNumEl.offsetWidth;
			this.bpmNumEl.classList.add("andante-beat-pulse");
		}
	}

	private tap(): void {
		const now = performance.now();
		this.tapTimes.push(now);
		this.tapTimes = this.tapTimes.filter((t) => now - t < 2500).slice(-8);
		if (this.tapTimes.length >= 2) {
			let sum = 0;
			for (let i = 1; i < this.tapTimes.length; i++) sum += this.tapTimes[i] - this.tapTimes[i - 1];
			const avg = sum / (this.tapTimes.length - 1);
			if (avg > 0) this.setBpm(60000 / avg);
		}
	}

	private scheduleSave(): void {
		if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = null;
			void this.plugin.saveSettings();
		}, 400);
	}
}
