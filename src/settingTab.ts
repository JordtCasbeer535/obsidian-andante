import { App, PluginSettingTab, Setting } from "obsidian";
import type AndantePlugin from "./main";
import { clampBeats, clampBpm, MAX_BEATS, MAX_BPM, MIN_BEATS, MIN_BPM, normalizeSound, normalizeSubdivision, resizePattern, SESSION_OPTIONS } from "./settings";
import { t } from "./text";

export class AndanteSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: AndantePlugin) { super(app, plugin); }
	private async persistChanges(): Promise<void> {
		this.plugin.refreshViews();
		await this.plugin.saveSettings();
	}
	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("p", { text: t("settingsIntro") });
		new Setting(containerEl).setName(t("defaultTempo")).setDesc(t("tempoDesc"))
			.addSlider(s => s.setLimits(MIN_BPM, MAX_BPM, 1).setValue(this.plugin.settings.bpm).setDynamicTooltip()
				.onChange(async value => { this.plugin.settings.bpm = clampBpm(value); await this.persistChanges(); }));
		new Setting(containerEl).setName(t("perMeasure")).setDesc(t("beatsDesc"))
			.addSlider(s => s.setLimits(MIN_BEATS, MAX_BEATS, 1).setValue(this.plugin.settings.beats).setDynamicTooltip()
				.onChange(async value => {
					this.plugin.settings.beats = clampBeats(value);
					this.plugin.settings.beatPattern = resizePattern(this.plugin.settings.beatPattern, this.plugin.settings.beats);
					await this.persistChanges();
				}));
		new Setting(containerEl).setName(t("subdivision")).setDesc(t("subdivisionDesc"))
			.addDropdown(d => d.addOption("1", t("quarter")).addOption("2", t("eighth"))
				.addOption("3", t("triplet")).addOption("4", t("sixteenth"))
				.setValue(String(this.plugin.settings.subdivision))
				.onChange(async value => { this.plugin.settings.subdivision = normalizeSubdivision(Number(value)); await this.persistChanges(); }));
		new Setting(containerEl).setName(t("sound")).setDesc(t("soundDesc"))
			.addDropdown(d => d.addOption("click", t("click")).addOption("woodblock", t("woodblock")).addOption("soft", t("soft"))
				.setValue(this.plugin.settings.sound)
				.onChange(async value => { this.plugin.settings.sound = normalizeSound(value); await this.persistChanges(); }));
		new Setting(containerEl).setName(t("volume")).setDesc(t("volumeDesc"))
			.addSlider(s => s.setLimits(0, 100, 1).setValue(Math.round(this.plugin.settings.volume * 100)).setDynamicTooltip()
				.onChange(async value => { this.plugin.settings.volume = value / 100; await this.persistChanges(); }));
		new Setting(containerEl).setName(t("duration")).setDesc(t("durationDesc"))
			.addDropdown(d => {
				for (const minutes of SESSION_OPTIONS) d.addOption(String(minutes), minutes ? `${minutes} ${t("minutes")}` : t("unlimited"));
				d.setValue(String(this.plugin.settings.sessionMinutes))
					.onChange(async value => { this.plugin.settings.sessionMinutes = Number(value); await this.persistChanges(); });
			});
	}
}
