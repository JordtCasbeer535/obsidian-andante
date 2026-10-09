import { App, PluginSettingTab, Setting } from "obsidian";
import type AndantePlugin from "./main";
import { clampBeats, clampBpm, MAX_BEATS, MAX_BPM, MIN_BEATS, MIN_BPM } from "./settings";

export class AndanteSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: AndantePlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Default tempo")
			.setDesc("Beats per minute used when the metronome opens.")
			.addSlider((s) =>
				s
					.setLimits(MIN_BPM, MAX_BPM, 1)
					.setValue(this.plugin.settings.bpm)
					.onChange(async (v) => {
						this.plugin.settings.bpm = clampBpm(v);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Beats per measure")
			.setDesc("How many beats make up one measure.")
			.addSlider((s) =>
				s
					.setLimits(MIN_BEATS, MAX_BEATS, 1)
					.setValue(this.plugin.settings.beats)
					.onChange(async (v) => {
						this.plugin.settings.beats = clampBeats(v);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Volume")
			.setDesc("Loudness of the click.")
			.addSlider((s) =>
				s
					.setLimits(0, 100, 1)
					.setValue(Math.round(this.plugin.settings.volume * 100))
					.onChange(async (v) => {
						this.plugin.settings.volume = v / 100;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Accent downbeat")
			.setDesc("Play the first beat of each measure at a higher pitch.")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.accent).onChange(async (v) => {
					this.plugin.settings.accent = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Sound")
			.setDesc("Timbre of the click. Both are synthesized — no audio files needed.")
			.addDropdown((d) =>
				d
					.addOption("click", "Click")
					.addOption("woodblock", "Woodblock")
					.setValue(this.plugin.settings.sound)
					.onChange(async (v) => {
						this.plugin.settings.sound = v === "woodblock" ? "woodblock" : "click";
						await this.plugin.saveSettings();
					})
			);
	}
}
