import { App, PluginSettingTab, Setting } from "obsidian";
import type FsrsPlugin from "../main"; // Use 'type' for type-only import
import { FsrsPluginSettings } from "../types"; // Import from settings.ts

export class FsrsSettingTab extends PluginSettingTab {
	plugin: FsrsPlugin;

	constructor(app: App, plugin: FsrsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty(); // Clear any existing settings
		containerEl.createEl("h2", { text: "FSRS Quiz Plugin Settings" });

		new Setting(containerEl)
			.setName("FSRS frontmatter key")
			.setDesc(
				'The frontmatter key used to identify quiz notes (e.g., "quiz"). The value of this key in the frontmatter should be "true".',
			)
			.addText((text) =>
				text
					.setPlaceholder("Example: quiz")
					.setValue(this.plugin.settings.fsrsFrontmatterKey)
					.onChange(async (value) => {
						this.plugin.settings.fsrsFrontmatterKey = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Quiz hidden comment marker")
			.setDesc(
				'The hidden comment marker to identify quiz notes (e.g., "%%quiz%%"). This marker will be invisible in reading view.',
			)
			.addText((text) =>
				text
					.setPlaceholder("Example: %%quiz%%")
					.setValue(this.plugin.settings.quizMarker)
					.onChange(async (value) => {
						this.plugin.settings.quizMarker = value.trim();
						await this.plugin.saveSettings();
					}),
			);
		containerEl.createEl("h3", { text: "Quiz Rating Hotkeys" });
		containerEl.createEl("p", {
			text: "Define single character hotkeys for rating answers. These are case-insensitive.",
		});
		// Add more settings here as needed

		new Setting(containerEl)
			.setName('Rate "Again" Hotkey')
			.setDesc('Key to rate the card as "Again".')
			.addText((text) =>
				text
					.setPlaceholder("a")
					.setValue(this.plugin.settings.ratingAgainKey)
					.onChange(async (value) => {
						// Store as lowercase, use first char if multiple entered
						this.plugin.settings.ratingAgainKey =
							value.trim().toLowerCase().charAt(0) || "a";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Rate "Hard" Hotkey')
			.setDesc('Key to rate the card as "Hard".')
			.addText((text) =>
				text
					.setPlaceholder("r")
					.setValue(this.plugin.settings.ratingHardKey)
					.onChange(async (value) => {
						this.plugin.settings.ratingHardKey =
							value.trim().toLowerCase().charAt(0) || "r";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Rate "Good" Hotkey')
			.setDesc('Key to rate the card as "Good".')
			.addText((text) =>
				text
					.setPlaceholder("s")
					.setValue(this.plugin.settings.ratingGoodKey)
					.onChange(async (value) => {
						this.plugin.settings.ratingGoodKey =
							value.trim().toLowerCase().charAt(0) || "s";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Rate "Easy" Hotkey')
			.setDesc('Key to rate the card as "Easy".')
			.addText((text) =>
				text
					.setPlaceholder("t")
					.setValue(this.plugin.settings.ratingEasyKey)
					.onChange(async (value) => {
						this.plugin.settings.ratingEasyKey =
							value.trim().toLowerCase().charAt(0) || "t";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Max new cards per day")
			.setDesc(
				"The maximum number of new cards to introduce during a review session each day.",
			)
			.addText((text) =>
				text
					.setPlaceholder("20")
					.setValue(String(this.plugin.settings.maxNewCardsPerDay))
					.onChange(async (value) => {
						const num = Number(value);
						if (!isNaN(num) && num >= 0) {
							this.plugin.settings.maxNewCardsPerDay = num;
							await this.plugin.saveSettings();
							// Add this line to force a refresh of the UI
							await this.plugin.updateUIDisplays();
						}
					}),
			);

		new Setting(containerEl)
			.setName("Shuffle new cards")
			.setDesc(
				"Randomize the order of new cards during a review session.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.shuffleNewCards)
					.onChange(async (value) => {
						this.plugin.settings.shuffleNewCards = value;
						await this.plugin.saveSettings();
					}),
			);
		containerEl.createEl("h3", { text: "Advanced Settings" });

		new Setting(containerEl)
			.setName("Cram Card Retention Rate")
			.setDesc(
				"Set the desired retention rate for cards marked with '?srs(cram)'. Must be a number between 0 and 1 (e.g., 0.99 for 99%).",
			)
			.addText((text) =>
				text
					.setPlaceholder("0.99")
					.setValue(String(this.plugin.settings.cramCardRetention))
					.onChange(async (value) => {
						const num = parseFloat(value);
						if (!isNaN(num) && num > 0 && num <= 1) {
							this.plugin.settings.cramCardRetention = num;
							await this.plugin.saveSettings();
						}
					}),
			);
	}
}
