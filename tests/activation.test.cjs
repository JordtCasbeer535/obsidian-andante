const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const esbuild = require("esbuild");

const VIEW_TYPE = "andante-metronome-view";
const source = esbuild.buildSync({
	entryPoints: [path.join(__dirname, "../src/main.ts")],
	bundle: true,
	write: false,
	platform: "node",
	format: "cjs",
	external: ["obsidian"],
}).outputFiles[0].text;

async function fixture({ modern = true, existing = false, deferred = modern } = {}) {
	const commands = new Map();
	const factories = new Map();
	const leaves = [];
	const events = [];
	let ribbon;
	let toggles = 0;
	let plugin;
	const rightSplit = { collapsed: true, expand() { this.collapsed = false; } };
	const leaf = {
		view: null,
		getRoot: () => rightSplit,
		async setViewState(state) {
			assert.equal(state.type, VIEW_TYPE);
			if (!leaves.includes(this)) leaves.push(this);
			this.view = deferred ? { deferred: true } : loadedView();
		},
	};
	function loadedView() {
		const view = factories.get(VIEW_TYPE)(leaf);
		view.toggle = () => { toggles++; events.push("toggle"); };
		return view;
	}
	const workspace = {
		rightSplit,
		activeLeaf: null,
		getLeavesOfType: (type) => type === VIEW_TYPE ? leaves : [],
		getRightLeaf: () => leaf,
		setActiveLeaf(target, options) {
			assert.equal(options.focus, true);
			this.activeLeaf = target;
		},
	};
	if (modern) {
		workspace.revealLeaf = async (target) => {
			events.push("reveal-start");
			rightSplit.expand();
			await Promise.resolve();
			if (target.view.deferred) target.view = loadedView();
			workspace.activeLeaf = target;
			events.push("reveal-complete");
		};
	}
	class Plugin {
		constructor(app) { this.app = app; }
		async loadData() { return {}; }
		registerView(type, factory) { factories.set(type, factory); }
		addRibbonIcon(icon, title, callback) { ribbon = callback; }
		addCommand(command) { commands.set(command.id, command); }
		addSettingTab() {}
	}
	class ItemView { constructor(target) { this.leaf = target; } }
	class PluginSettingTab {}
	const obsidian = { Plugin, ItemView, PluginSettingTab, Modal: class {}, requireApiVersion: () => modern };
	const module = { exports: {} };
	vm.runInNewContext(source, {
		module,
		exports: module.exports,
		require(id) {
			assert.equal(id, "obsidian");
			return obsidian;
		},
	});
	plugin = new module.exports.default({ workspace });
	await plugin.onload();
	if (existing) await leaf.setViewState({ type: VIEW_TYPE, active: true });
	return {
		workspace, leaf, leaves, events,
		get toggles() { return toggles; },
		clickRibbon: () => ribbon(),
		command: (id) => commands.get(id).callback(),
	};
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("open command expands a collapsed sidebar and loads a new deferred view", async () => {
	const app = await fixture();
	app.command("open-metronome");
	await settle();
	assert.equal(app.workspace.rightSplit.collapsed, false);
	assert.equal(app.workspace.activeLeaf, app.leaf);
	assert.equal(app.leaf.view.deferred, undefined);
	assert.equal(app.leaves.length, 1);
});

test("ribbon reveals an existing deferred view restored from the workspace", async () => {
	const app = await fixture({ existing: true });
	app.clickRibbon();
	await settle();
	assert.equal(app.workspace.rightSplit.collapsed, false);
	assert.equal(app.leaf.view.deferred, undefined);
	assert.equal(app.workspace.activeLeaf, app.leaf);
});

test("opening an existing view selects its tab without creating a duplicate", async () => {
	const app = await fixture({ existing: true, deferred: false });
	app.workspace.activeLeaf = { view: "other-sidebar-tab" };
	app.clickRibbon();
	await settle();
	assert.equal(app.workspace.activeLeaf, app.leaf);
	assert.equal(app.leaves.length, 1);
});

test("toggle command waits for a deferred view to load before calling toggle", async () => {
	const app = await fixture({ existing: true });
	app.command("toggle-metronome");
	await settle();
	assert.equal(app.toggles, 1);
	assert.ok(app.events.indexOf("reveal-complete") < app.events.indexOf("toggle"));
});

test("opening a view on the declared older API expands the sidebar without revealLeaf", async () => {
	const app = await fixture({ modern: false });
	app.command("open-metronome");
	await settle();
	assert.equal(app.workspace.revealLeaf, undefined);
	assert.equal(app.workspace.rightSplit.collapsed, false);
	assert.equal(app.workspace.activeLeaf, app.leaf);
});

test("toggle command keeps working for an already loaded view", async () => {
	const app = await fixture({ existing: true, deferred: false });
	app.command("toggle-metronome");
	await settle();
	assert.equal(app.toggles, 1);
});
