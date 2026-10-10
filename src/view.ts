import { ItemView, Modal, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import { MetronomeEngine } from "./engine";
import { BUILTIN_PRESETS, clampBeats, clampBpm, MAX_BPM, MIN_BPM, MAX_PRESETS, resizePattern, SESSION_OPTIONS } from "./settings";
import type { BeatKind, RhythmPreset, Subdivision } from "./settings";
import { t, TextKey } from "./text";
import type AndantePlugin from "./main";

export const VIEW_TYPE_ANDANTE = "andante-metronome-view";
const SUBDIVISIONS: { value: Subdivision; label: TextKey }[] = [
	{ value: 1, label: "quarter" }, { value: 2, label: "eighth" },
	{ value: 3, label: "triplet" }, { value: 4, label: "sixteenth" },
];
const BEAT_CYCLE: BeatKind[] = ["accent", "normal", "mute"];

function iconButton(parent: HTMLElement, icon: string, label: string, cls = "andante-icon-button"): HTMLButtonElement {
	const button = parent.createEl("button", { cls, attr: { type: "button", "aria-label": label, title: label } });
	setIcon(button, icon);
	return button;
}

function timeText(seconds: number): string {
	const total = Math.max(0, Math.floor(seconds));
	return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function tempoMark(bpm: number): string {
	return bpm < 60 ? "Largo" : bpm < 80 ? "Andante" : bpm < 110 ? "Moderato" : bpm < 140 ? "Allegro" : bpm < 180 ? "Vivace" : "Presto";
}

class PresetNameModal extends Modal {
	constructor(plugin: AndantePlugin, private onSave: (name: string) => void) { super(plugin.app); }
	onOpen(): void {
		this.contentEl.addClass("andante-preset-modal");
		this.contentEl.createEl("h3", { text: t("savePreset") });
		const input = this.contentEl.createEl("input", {
			attr: { type: "text", maxlength: "40", placeholder: t("namePlaceholder"), "aria-label": t("presetName") },
		});
		const actions = this.contentEl.createDiv({ cls: "andante-modal-actions" });
		const cancel = actions.createEl("button", { text: t("cancel") });
		cancel.addEventListener("click", () => this.close());
		const save = actions.createEl("button", { cls: "mod-cta", text: t("save") });
		save.disabled = true;
		const submit = () => {
			const name = input.value.trim();
			if (!name) return;
			this.onSave(name);
			this.close();
		};
		input.addEventListener("input", () => { save.disabled = !input.value.trim(); });
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); submit(); }
		});
		save.addEventListener("click", submit);
		input.focus();
	}
	onClose(): void { this.contentEl.empty(); }
}

class RemovePresetModal extends Modal {
	constructor(plugin: AndantePlugin, private preset: RhythmPreset, private onRemove: () => void) { super(plugin.app); }
	onOpen(): void {
		this.contentEl.createEl("h3", { text: t("deleteConfirm") });
		this.contentEl.createEl("p", { text: this.preset.name });
		const actions = this.contentEl.createDiv({ cls: "andante-modal-actions" });
		const cancel = actions.createEl("button", { text: t("cancel") });
		cancel.addEventListener("click", () => this.close());
		const remove = actions.createEl("button", { cls: "mod-warning", text: t("delete") });
		remove.addEventListener("click", () => { this.onRemove(); this.close(); });
	}
	onClose(): void { this.contentEl.empty(); }
}

export class MetronomeView extends ItemView {
	private engine: MetronomeEngine;
	private tapTimes: number[] = [];
	private saveTimer: number | null = null;
	private clockTimer: number | null = null;
	private closed = true;
	private completed = false;
	private measures = 0;
	private activeDuration = 0;
	private activePresetId = "";
	private lastVolume = 0.8;
	private shell!: HTMLElement;
	private statusEl!: HTMLElement;
	private bpmInput!: HTMLInputElement;
	private tempoMarkEl!: HTMLElement;
	private dial!: HTMLElement;
	private tempoSlider!: HTMLInputElement;
	private playBtn!: HTMLButtonElement;
	private playLabel!: HTMLElement;
	private playIcon!: HTMLElement;
	private tapBtn!: HTMLButtonElement;
	private beatCountEl!: HTMLElement;
	private beatMinus!: HTMLButtonElement;
	private beatPlus!: HTMLButtonElement;
	private beatBar!: HTMLElement;
	private beatButtons: HTMLButtonElement[] = [];
	private subButtons = new Map<Subdivision, HTMLButtonElement>();
	private soundButtons = new Map<string, HTMLButtonElement>();
	private subLights!: HTMLElement;
	private volumeSlider!: HTMLInputElement;
	private volumeLabel!: HTMLElement;
	private muteBtn!: HTMLButtonElement;
	private durationSelect!: HTMLSelectElement;
	private timerLabel!: HTMLElement;
	private timerValue!: HTMLElement;
	private measuresEl!: HTMLElement;
	private progress!: HTMLProgressElement;
	private presetSelect!: HTMLSelectElement;
	private removePresetBtn!: HTMLButtonElement;

	constructor(leaf: WorkspaceLeaf, private plugin: AndantePlugin) {
		super(leaf);
		this.engine = new MetronomeEngine({
			getBpm: () => this.plugin.settings.bpm,
			getBeats: () => this.plugin.settings.beats,
			getVolume: () => this.plugin.settings.volume,
			getSound: () => this.plugin.settings.sound,
			getSubdivision: () => this.plugin.settings.subdivision,
			getBeatKind: (beat) => this.plugin.settings.beatPattern[beat] ?? "normal",
			getDurationSeconds: () => this.activeDuration,
		});
		this.engine.onPulse = (beat, part, parts) => this.flashBeat(beat, part, parts);
		this.engine.onFinish = () => {
			this.completed = true;
			this.renderTransport();
			this.clearBeat();
			this.updateClock();
		};
	}

	getViewType(): string { return VIEW_TYPE_ANDANTE; }
	getDisplayText(): string { return "Andante"; }
	getIcon(): string { return "timer"; }

	async onOpen(): Promise<void> {
		this.closed = false;
		const root = this.contentEl;
		root.empty();
		root.addClass("andante");
		this.shell = root.createDiv({ cls: "andante-shell", attr: { tabindex: "0", "aria-label": "Andante" } });
		const header = this.shell.createDiv({ cls: "andante-header" });
		const brand = header.createDiv();
		brand.createDiv({ cls: "andante-wordmark", text: "Andante" });
		brand.createDiv({ cls: "andante-eyebrow", text: t("studio") });
		this.statusEl = header.createDiv({ cls: "andante-status", attr: { role: "status" } });

		const hero = this.shell.createDiv({ cls: "andante-hero" });
		this.dial = hero.createDiv({ cls: "andante-dial" });
		const face = this.dial.createDiv({ cls: "andante-dial-face" });
		face.createSpan({ cls: "andante-eyebrow", text: t("tempo") });
		this.bpmInput = face.createEl("input", {
			cls: "andante-bpm-input", attr: { type: "number", min: String(MIN_BPM), max: String(MAX_BPM), step: "1", "aria-label": t("editTempo"), title: t("editTempo") },
		});
		this.bpmInput.addEventListener("change", () => this.changeTempo(Number(this.bpmInput.value)));
		this.bpmInput.addEventListener("blur", () => { this.bpmInput.value = String(this.plugin.settings.bpm); });
		this.bpmInput.addEventListener("keydown", (event) => {
			if (event.key === "Enter") { this.changeTempo(Number(this.bpmInput.value)); this.bpmInput.blur(); }
			if (event.key === "Escape") { this.bpmInput.value = String(this.plugin.settings.bpm); this.bpmInput.blur(); }
		});
		face.createSpan({ cls: "andante-bpm-unit", text: t("bpm") });
		this.tempoMarkEl = face.createSpan({ cls: "andante-tempo-mark" });
		const scale = hero.createDiv({ cls: "andante-tempo-scale" });
		scale.createSpan({ text: String(MIN_BPM) });
		this.tempoSlider = scale.createEl("input", { cls: "andante-slider", attr: {
			type: "range", min: String(MIN_BPM), max: String(MAX_BPM), step: "1", "aria-label": t("tempo"),
		} });
		this.tempoSlider.addEventListener("input", () => this.changeTempo(Number(this.tempoSlider.value)));
		scale.createSpan({ text: String(MAX_BPM) });

		const transport = hero.createDiv({ cls: "andante-transport" });
		const minus = iconButton(transport, "minus", t("decrease"), "andante-step");
		minus.addEventListener("click", (event) => this.changeTempo(this.plugin.settings.bpm - (event.shiftKey ? 5 : 1)));
		this.playBtn = transport.createEl("button", { cls: "andante-play", attr: { type: "button" } });
		this.playIcon = this.playBtn.createSpan({ cls: "andante-play-icon" });
		this.playLabel = this.playBtn.createSpan();
		this.playBtn.addEventListener("click", () => this.toggle());
		const plus = iconButton(transport, "plus", t("increase"), "andante-step");
		plus.addEventListener("click", (event) => this.changeTempo(this.plugin.settings.bpm + (event.shiftKey ? 5 : 1)));
		this.tapBtn = hero.createEl("button", { cls: "andante-tap", text: t("tap"), attr: { type: "button", title: t("tapHint") } });
		this.tapBtn.addEventListener("click", () => this.tapTempo());

		const rhythm = this.section("rhythm");
		const beatRow = rhythm.createDiv({ cls: "andante-control-row" });
		beatRow.createSpan({ cls: "andante-control-label", text: t("perMeasure") });
		const stepper = beatRow.createDiv({ cls: "andante-beat-stepper" });
		this.beatMinus = iconButton(stepper, "minus", t("fewer"));
		this.beatMinus.addEventListener("click", () => this.changeBeats(this.plugin.settings.beats - 1));
		this.beatCountEl = stepper.createSpan();
		this.beatPlus = iconButton(stepper, "plus", t("more"));
		this.beatPlus.addEventListener("click", () => this.changeBeats(this.plugin.settings.beats + 1));
		this.beatBar = rhythm.createDiv({ cls: "andante-beat-bar", attr: { "aria-label": t("rhythm") } });
		const beatHelp = rhythm.createDiv({ cls: "andante-beat-help" });
		beatHelp.createSpan({ text: t("beatHint") });
		const reset = iconButton(beatHelp, "rotate-ccw", t("patternReset"));
		reset.addEventListener("click", () => {
			this.plugin.settings.beatPattern = resizePattern([], this.plugin.settings.beats);
			this.renderBeats(); this.markEdited(); this.scheduleSave();
		});
		rhythm.createDiv({ cls: "andante-control-label andante-sub-label", text: t("subdivision") });
		const subRow = rhythm.createDiv({ cls: "andante-segments", attr: { role: "group", "aria-label": t("subdivision") } });
		this.subButtons.clear();
		for (const { value, label } of SUBDIVISIONS) {
			const button = subRow.createEl("button", { attr: { type: "button", "aria-label": `${t("subdivision")}: ${t(label)}` } });
			button.createSpan({ cls: "andante-segment-count", text: `×${value}` });
			button.createSpan({ text: t(label) });
			button.addEventListener("click", () => {
				this.plugin.settings.subdivision = value;
				this.renderRhythm(); this.markEdited(); this.scheduleSave();
			});
			this.subButtons.set(value, button);
		}
		this.subLights = rhythm.createDiv({ cls: "andante-sub-lights", attr: { "aria-hidden": "true" } });

		const sound = this.section("sound");
		const soundRow = sound.createDiv({ cls: "andante-sound-options", attr: { role: "group", "aria-label": t("sound") } });
		this.soundButtons.clear();
		for (const kind of ["click", "woodblock", "soft"] as const) {
			const button = soundRow.createEl("button", { text: t(kind), attr: { type: "button" } });
			button.addEventListener("click", () => {
				this.plugin.settings.sound = kind;
				this.renderSound(); this.markEdited(); this.scheduleSave();
			});
			this.soundButtons.set(kind, button);
		}
		const volume = sound.createDiv({ cls: "andante-volume-row" });
		this.muteBtn = iconButton(volume, "volume-2", t("muteAudio"));
		this.muteBtn.addEventListener("click", () => {
			const current = this.plugin.settings.volume;
			if (current > 0) this.lastVolume = current;
			this.plugin.settings.volume = current > 0 ? 0 : this.lastVolume;
			this.renderSound(); this.scheduleSave();
		});
		this.volumeSlider = volume.createEl("input", { cls: "andante-slider", attr: {
			type: "range", min: "0", max: "100", step: "1", "aria-label": t("volume"),
		} });
		this.volumeSlider.addEventListener("input", () => {
			this.plugin.settings.volume = Number(this.volumeSlider.value) / 100;
			this.renderSound(); this.scheduleSave();
		});
		this.volumeLabel = volume.createSpan({ cls: "andante-volume-value" });

		const session = this.section("session");
		const duration = session.createDiv({ cls: "andante-control-row" });
		const durationLabel = duration.createEl("label", { text: t("duration"), cls: "andante-control-label" });
		this.durationSelect = durationLabel.createEl("select", { cls: "andante-duration-select", attr: { "aria-label": t("duration"), title: t("nextSession") } });
		for (const minutes of SESSION_OPTIONS) this.durationSelect.createEl("option", {
			text: minutes ? `${minutes} ${t("minutes")}` : t("unlimited"), attr: { value: String(minutes) },
		});
		this.durationSelect.addEventListener("change", () => {
			this.plugin.settings.sessionMinutes = Number(this.durationSelect.value);
			this.activeDuration = this.plugin.settings.sessionMinutes * 60;
			this.engine.resetElapsed();
			this.measures = 0;
			this.completed = false;
			this.renderTransport(); this.updateClock(); this.scheduleSave();
		});
		const clock = session.createDiv({ cls: "andante-clock" });
		const clockMain = clock.createDiv();
		this.timerLabel = clockMain.createDiv({ cls: "andante-eyebrow" });
		this.timerValue = clockMain.createDiv({ cls: "andante-time" });
		this.measuresEl = clock.createDiv({ cls: "andante-measures" });
		this.progress = session.createEl("progress", { cls: "andante-progress", attr: { max: "1", "aria-label": t("session") } });
		session.createDiv({ cls: "andante-help", text: t("nextSession") });

		const presets = this.section("presets");
		const presetRow = presets.createDiv({ cls: "andante-preset-row" });
		this.presetSelect = presetRow.createEl("select", { attr: { "aria-label": t("presets") } });
		this.presetSelect.addEventListener("change", () => {
			const preset = [...BUILTIN_PRESETS, ...this.plugin.settings.presets].find(p => p.id === this.presetSelect.value);
			if (preset) this.applyPreset(preset);
		});
		const savePreset = iconButton(presetRow, "bookmark-plus", t("savePreset"));
		savePreset.addEventListener("click", () => this.savePreset());
		this.removePresetBtn = iconButton(presetRow, "trash-2", t("removePreset"));
		this.removePresetBtn.addEventListener("click", () => this.removePreset());
		this.shell.createDiv({ cls: "andante-keyboard-hint", text: t("keyboard") });
		this.registerDomEvent(this.shell, "keydown", event => this.onKeydown(event));
		this.activeDuration = this.plugin.settings.sessionMinutes * 60;
		this.syncSettings();
		this.clockTimer = window.setInterval(() => { if (this.engine.isRunning) this.updateClock(); }, 200);
	}

	private section(label: TextKey): HTMLElement {
		const section = this.shell.createEl("section", { cls: "andante-section" });
		section.createEl("h3", { cls: "andante-section-title", text: t(label) });
		return section;
	}

	/** Synchronize host settings without rebuilding the view or interrupting audio. */
	syncSettings(): void {
		if (this.closed) return;
		if (this.activePresetId) {
			const preset = [...BUILTIN_PRESETS, ...this.plugin.settings.presets].find(p => p.id === this.activePresetId);
			const s = this.plugin.settings;
			if (!preset || preset.bpm !== s.bpm || preset.beats !== s.beats || preset.subdivision !== s.subdivision ||
				preset.sound !== s.sound || preset.beatPattern.join() !== s.beatPattern.join()) this.activePresetId = "";
		}
		this.renderTempo(); this.renderBeats(); this.renderRhythm(); this.renderSound(); this.renderPresets();
		if (!this.engine.isRunning) this.activeDuration = this.plugin.settings.sessionMinutes * 60;
		this.durationSelect.value = String(this.engine.isRunning ? this.activeDuration / 60 : this.plugin.settings.sessionMinutes);
		this.renderTransport(); this.updateClock();
	}

	async onClose(): Promise<void> {
		this.shutdown();
		await this.plugin.saveSettings();
	}

	shutdown(): void {
		this.closed = true;
		this.engine.stop();
		if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
		if (this.clockTimer !== null) window.clearInterval(this.clockTimer);
		this.saveTimer = this.clockTimer = null;
	}

	toggle(): void {
		if (this.closed) return;
		if (this.engine.isRunning) this.stop();
		else void this.start();
	}

	private async start(): Promise<void> {
		this.completed = false;
		this.measures = 0;
		this.activeDuration = this.plugin.settings.sessionMinutes * 60;
		try {
			const starting = this.engine.start();
			this.renderTransport();
			await starting;
			if (!this.closed) { this.renderTransport(); this.updateClock(); }
		} catch {
			if (!this.closed) { this.renderTransport(); new Notice(t("audioError")); }
		}
	}

	private stop(): void {
		this.engine.stop(); this.clearBeat(); this.renderTransport(); this.updateClock();
	}

	private renderTransport(): void {
		const running = this.engine.isRunning;
		setIcon(this.playIcon, running ? "square" : "play");
		this.playLabel.textContent = t(running ? "stopShort" : "startShort");
		this.playBtn.setAttribute("aria-label", t(running ? "stop" : "start"));
		this.playBtn.setAttribute("aria-pressed", String(running));
		this.shell.toggleClass("is-playing", running);
		this.statusEl.textContent = t(running ? "playing" : this.completed ? "complete" : this.engine.elapsedSeconds > 0 ? "stopped" : "ready");
		this.durationSelect.disabled = running;
	}

	changeTempo(value: number): void {
		this.plugin.settings.bpm = clampBpm(value);
		if (!this.closed) { this.renderTempo(); this.markEdited(); this.scheduleSave(); }
	}

	private renderTempo(): void {
		const bpm = this.plugin.settings.bpm;
		this.bpmInput.value = this.tempoSlider.value = String(bpm);
		this.tempoMarkEl.textContent = tempoMark(bpm);
		const amount = (bpm - MIN_BPM) / (MAX_BPM - MIN_BPM);
		this.dial.style.setProperty("--tempo-turn", `${amount * 0.75}turn`);
		this.tempoSlider.style.setProperty("--range-fill", `${amount * 100}%`);
	}

	private changeBeats(value: number): void {
		this.plugin.settings.beats = clampBeats(value);
		this.plugin.settings.beatPattern = resizePattern(this.plugin.settings.beatPattern, this.plugin.settings.beats);
		this.renderBeats(); this.markEdited(); this.scheduleSave();
	}

	private renderBeats(): void {
		const { beats, beatPattern } = this.plugin.settings;
		this.beatCountEl.textContent = String(beats);
		this.beatMinus.disabled = beats === 1;
		this.beatPlus.disabled = beats === 8;
		this.beatBar.empty();
		this.beatButtons = [];
		for (let i = 0; i < beats; i++) {
			const kind = beatPattern[i];
			const button = this.beatBar.createEl("button", {
				cls: `andante-beat is-${kind}`, text: String(i + 1),
				attr: { type: "button", "aria-label": `${t("beat")} ${i + 1}: ${t(kind)}`, title: `${i + 1} · ${t(kind)}` },
			});
			button.addEventListener("click", () => {
				const current = this.plugin.settings.beatPattern[i];
				this.plugin.settings.beatPattern[i] = BEAT_CYCLE[(BEAT_CYCLE.indexOf(current) + 1) % 3];
				// Keep the clicked button focused for keyboard and assistive technology.
				const next = this.plugin.settings.beatPattern[i];
				button.removeClass("is-accent", "is-normal", "is-mute"); button.addClass(`is-${next}`);
				button.setAttribute("aria-label", `${t("beat")} ${i + 1}: ${t(next)}`);
				button.title = `${i + 1} · ${t(next)}`;
				this.markEdited(); this.scheduleSave();
			});
			this.beatButtons.push(button);
		}
	}

	private renderRhythm(): void {
		const subdivision = this.plugin.settings.subdivision;
		for (const [value, button] of this.subButtons) {
			button.toggleClass("is-selected", value === subdivision);
			button.setAttribute("aria-pressed", String(value === subdivision));
		}
		this.subLights.empty();
		for (let i = 0; i < subdivision; i++) this.subLights.createSpan();
	}

	private renderSound(): void {
		const { volume, sound } = this.plugin.settings;
		for (const [kind, button] of this.soundButtons) {
			button.toggleClass("is-selected", kind === sound);
			button.setAttribute("aria-pressed", String(kind === sound));
		}
		if (volume > 0) this.lastVolume = volume;
		this.volumeSlider.value = String(Math.round(volume * 100));
		this.volumeSlider.style.setProperty("--range-fill", `${volume * 100}%`);
		this.volumeLabel.textContent = `${Math.round(volume * 100)}%`;
		setIcon(this.muteBtn, volume === 0 ? "volume-x" : "volume-2");
		this.muteBtn.setAttribute("aria-label", t(volume === 0 ? "unmuteAudio" : "muteAudio"));
		this.muteBtn.title = t(volume === 0 ? "unmuteAudio" : "muteAudio");
		this.muteBtn.setAttribute("aria-pressed", String(volume === 0));
	}

	private flashBeat(beat: number, part: number, parts: number): void {
		if (this.closed) return;
		if (part === 0) {
			this.clearBeat();
			this.beatButtons[beat]?.addClass("is-current");
			if (beat === 0) this.measures++;
		}
		// Live subdivision changes can leave one old, already scheduled pulse.
		for (let i = 0; i < this.subLights.children.length; i++) {
			(this.subLights.children[i] as HTMLElement).toggleClass("is-current", parts === this.subLights.children.length && i === part);
		}
	}

	private clearBeat(): void {
		for (const button of this.beatButtons) button.removeClass("is-current");
		for (const light of Array.from(this.subLights.children)) light.removeClass("is-current");
	}

	private updateClock(): void {
		const elapsed = this.engine.elapsedSeconds;
		this.timerLabel.textContent = t(this.activeDuration ? "remaining" : "elapsed");
		this.timerValue.textContent = timeText(this.activeDuration ? Math.ceil(Math.max(0, this.activeDuration - elapsed)) : elapsed);
		this.measuresEl.textContent = `${this.measures} ${t("measures")}`;
		this.progress.hidden = this.activeDuration === 0;
		this.progress.value = this.activeDuration ? Math.min(1, elapsed / this.activeDuration) : 0;
	}

	tapTempo(): void {
		if (this.closed) return;
		const now = performance.now();
		this.tapTimes = this.tapTimes.filter(time => now - time < 2500).slice(-7);
		this.tapTimes.push(now);
		if (this.tapTimes.length > 1) {
			const interval = (now - this.tapTimes[0]) / (this.tapTimes.length - 1);
			if (interval > 0) this.changeTempo(60000 / interval);
		}
		this.tapBtn.removeClass("is-tapped");
		void this.tapBtn.offsetWidth;
		this.tapBtn.addClass("is-tapped");
	}

	private onKeydown(event: KeyboardEvent): void {
		const target = event.target as HTMLElement;
		if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || target.isContentEditable ||
			["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
		if (event.key === " " && target.tagName !== "BUTTON") { event.preventDefault(); if (!event.repeat) this.toggle(); }
		else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
			event.preventDefault(); this.changeTempo(this.plugin.settings.bpm + (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 5 : 1));
		} else if (event.key.toLowerCase() === "t" && !event.repeat) { event.preventDefault(); this.tapTempo(); }
	}

	private markEdited(): void {
		this.activePresetId = "";
		this.presetSelect.value = "";
		this.removePresetBtn.disabled = true;
	}

	private renderPresets(): void {
		this.presetSelect.empty();
		this.presetSelect.createEl("option", { text: t("choosePreset"), attr: { value: "" } });
		const builtins = this.presetSelect.createEl("optgroup", { attr: { label: t("builtins") } });
		for (const preset of BUILTIN_PRESETS) builtins.createEl("option", { text: t(preset.name as TextKey), attr: { value: preset.id } });
		if (this.plugin.settings.presets.length) {
			const saved = this.presetSelect.createEl("optgroup", { attr: { label: t("saved") } });
			for (const preset of this.plugin.settings.presets) saved.createEl("option", { text: preset.name, attr: { value: preset.id } });
		}
		this.presetSelect.value = this.activePresetId;
		this.removePresetBtn.disabled = !this.plugin.settings.presets.some(p => p.id === this.activePresetId);
	}

	private applyPreset(preset: RhythmPreset): void {
		const running = this.engine.isRunning;
		this.stop();
		this.engine.resetElapsed();
		this.measures = 0;
		Object.assign(this.plugin.settings, { bpm: preset.bpm, beats: preset.beats, subdivision: preset.subdivision,
			sound: preset.sound, beatPattern: [...preset.beatPattern] });
		this.activePresetId = preset.id;
		this.tapTimes = [];
		this.completed = false;
		this.syncSettings(); this.scheduleSave();
		if (running) void this.start();
	}

	private savePreset(): void {
		if (this.plugin.settings.presets.length >= MAX_PRESETS) { new Notice(t("presetLimit")); return; }
		new PresetNameModal(this.plugin, name => {
			const settings = this.plugin.settings;
			const preset: RhythmPreset = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				name, bpm: settings.bpm, beats: settings.beats, subdivision: settings.subdivision,
				sound: settings.sound, beatPattern: [...settings.beatPattern] };
			settings.presets.push(preset);
			this.activePresetId = preset.id;
			if (!this.closed) this.renderPresets();
			void this.plugin.saveSettings();
			new Notice(t("presetSaved"));
		}).open();
	}

	private removePreset(): void {
		const preset = this.plugin.settings.presets.find(p => p.id === this.activePresetId);
		if (!preset) return;
		new RemovePresetModal(this.plugin, preset, () => {
			this.plugin.settings.presets = this.plugin.settings.presets.filter(p => p.id !== preset.id);
			this.activePresetId = "";
			if (!this.closed) this.renderPresets();
			void this.plugin.saveSettings();
			new Notice(t("presetRemoved"));
		}).open();
	}

	private scheduleSave(): void {
		if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = null;
			void this.plugin.saveSettings();
		}, 400);
	}
}
