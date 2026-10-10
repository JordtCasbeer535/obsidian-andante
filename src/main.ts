import { Plugin, WorkspaceLeaf, requireApiVersion } from "obsidian";
import { MetronomeView, VIEW_TYPE_ANDANTE } from "./view";
import { AndanteSettingTab } from "./settingTab";
import { AndanteSettings, normalizeSettings } from "./settings";

export default class AndantePlugin extends Plugin {
	settings!: AndanteSettings;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(VIEW_TYPE_ANDANTE, (leaf) => new MetronomeView(leaf, this));

		this.addRibbonIcon("timer", "Andante metronome", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-metronome",
			name: "Open metronome",
			callback: () => {
				void this.activateView();
			},
		});

		this.addCommand({
			id: "toggle-metronome",
			name: "Start/stop metronome",
			callback: () => {
				const view = this.getView();
				if (view) view.toggle();
				else void this.activateView().then(() => this.getView()?.toggle());
			},
		});

		this.addSettingTab(new AndanteSettingTab(this.app, this));

		for (const [id, name, action] of [
			["increase-tempo", "Increase tempo", (view: MetronomeView) => view.changeTempo(this.settings.bpm + 1)],
			["decrease-tempo", "Decrease tempo", (view: MetronomeView) => view.changeTempo(this.settings.bpm - 1)],
			["tap-tempo", "Tap tempo", (view: MetronomeView) => view.tapTempo()],
		] as const) {
			this.addCommand({ id, name, callback: () => {
				const view = this.getView();
				if (view) action(view);
				else void this.activateView().then(() => { const loaded = this.getView(); if (loaded) action(loaded); });
			} });
		}
	}

	onunload(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_ANDANTE)) {
			if (leaf.view instanceof MetronomeView) leaf.view.shutdown();
		}
	}

	async loadSettings(): Promise<void> {
		this.settings = normalizeSettings(await this.loadData());
	}

	refreshViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_ANDANTE)) {
			if (leaf.view instanceof MetronomeView) leaf.view.syncSettings();
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private getView(): MetronomeView | null {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_ANDANTE);
		if (leaves.length === 0) return null;
		const view = leaves[0].view;
		return view instanceof MetronomeView ? view : null;
	}

	private async activateView(): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_ANDANTE);
		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getRightLeaf(false);
			if (leaf) await leaf.setViewState({ type: VIEW_TYPE_ANDANTE, active: true });
		}
		if (!leaf) return;

		if (requireApiVersion("1.7.2")) {
			// Revealing also loads deferred views before commands access them.
			await workspace.revealLeaf(leaf);
		} else {
			// Preserve support for the declared minimum Obsidian version.
			workspace.rightSplit.expand();
			workspace.setActiveLeaf(leaf, { focus: true });
		}
	}
}
