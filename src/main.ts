import { Plugin, WorkspaceLeaf } from "obsidian";
import { MetronomeView, VIEW_TYPE_ANDANTE } from "./view";
import { AndanteSettingTab } from "./settingTab";
import { AndanteSettings, DEFAULT_SETTINGS } from "./settings";

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
	}

	onunload(): void {}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<AndanteSettings>);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private getView(): MetronomeView | null {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_ANDANTE);
		if (leaves.length === 0) return null;
		return leaves[0].view as MetronomeView;
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
		if (leaf) workspace.revealLeaf(leaf);
	}
}
