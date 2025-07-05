import {
	App,
	Notice,
	Plugin,
	TFile,
	MarkdownPostProcessorContext,
	MarkdownView,
	Editor,
	stringifyYaml,
} from "obsidian";

import { fsrs, createEmptyCard, FSRS } from "./libs/fsrs";
import { QuizModal } from "./ui/QuizModal";
import { FsrsSettingTab } from "./ui/FsrsSettingsTab";
import {
	FsrsPluginSettings,
	DEFAULT_SETTINGS,
	QuizItem,
	Card,
	PluginContext,
} from "./types";
import { CalendarView, FSRS_CALENDAR_VIEW_TYPE } from "./ui/CalendarView";
import {
	buildClozeViewPlugin,
	buildSrsMarkerViewPlugin,
} from "./ui/decorations";
import { getDueReviewItems } from "./logic/scheduler";
import { processFile } from "./logic/parser";
import {
	FSRS_CARD_END_MARKER,
	FSRS_CARD_MARKER,
	FSRS_DATA_CODE_BLOCK_TYPE,
} from "./logic/consts";

export default class FsrsPlugin extends Plugin {
	settings: FsrsPluginSettings;
	public fsrsInstance: FSRS;
	ribbonIconEl: HTMLElement;
	statusBarItemEl: HTMLElement;
	intervalId: number;

	private getContext(): PluginContext {
		return {
			app: this.app,
			settings: this.settings,
			saveSettings: this.saveSettings.bind(this),
		};
	}

	async onload() {
		await this.loadSettings();
		this.fsrsInstance = fsrs({});
		this.statusBarItemEl = this.addStatusBarItem();
		this.ribbonIconEl = this.addRibbonIcon(
			"brain",
			"Start Quiz Review",
			() => {
				this.startQuizSession();
			},
		);
		this.ribbonIconEl.addClass("fsrs-ribbon-icon");

		this.addCommand({
			id: "start-fsrs-quiz-review",
			name: "Start FSRS Quiz Review",
			callback: () => {
				this.startQuizSession();
			},
		});

		this.addCommand({
			id: "open-fsrs-calendar-view",
			name: "Open FSRS Calendar",
			callback: () => {
				this.activateView();
			},
		});

		this.addCommand({
			id: "set-note-as-quiz-frontmatter",
			name: "Mark as quiz / Add card marker",
			hotkeys: [{ modifiers: ["Alt"], key: "Q" }],
			icon: "brain",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const file = view.file;
				if (!file) return;

				const fileCache = this.app.metadataCache.getFileCache(file);
				const quizKey = this.settings.quizFrontmatterKey || "quiz";

				if (
					fileCache?.frontmatter &&
					fileCache.frontmatter[quizKey] === true
				) {
					const cursor = editor.getCursor();
					const line = editor.getLine(cursor.line);

					if (line.trim() === "") {
						// Line is empty, insert the end marker.
						editor.setLine(cursor.line, FSRS_CARD_END_MARKER);
					} else {
						// Line has content, add the question marker.
						const newId = `^${Date.now().toString(36)}${Math.random()
							.toString(36)
							.substring(2, 5)}`;
						const newLine = `${line.trim()} ${FSRS_CARD_MARKER} ${newId}`;
						editor.setLine(cursor.line, newLine);
						editor.setCursor({
							line: cursor.line,
							ch: newLine.length,
						});
					}
				} else {
					this.app.fileManager.processFrontMatter(file, (fm: any) => {
						fm[quizKey] = true;
						new Notice(`Marked "${file.basename}" as a quiz.`);
					});
				}
			},
		});

		this.addSettingTab(new FsrsSettingTab(this.app, this));
		this.registerView(
			FSRS_CALENDAR_VIEW_TYPE,
			(leaf) => new CalendarView(leaf, this.getContext()),
		);
		this.registerEditorExtension(buildClozeViewPlugin(this));
		this.registerEditorExtension(buildSrsMarkerViewPlugin(this));
		this.registerMarkdownPostProcessor(
			(element: HTMLElement, context: MarkdownPostProcessorContext) => {
				const quizKey =
					this.settings.quizFrontmatterKey ||
					DEFAULT_SETTINGS.quizFrontmatterKey;
				if (
					!context.frontmatter ||
					context.frontmatter[quizKey] !== true
				) {
					return;
				}
				const walker = document.createTreeWalker(
					element,
					NodeFilter.SHOW_TEXT,
				);
				let node;
				const nodesToReplace: {
					originalNode: Node;
					replacementFragment: DocumentFragment;
				}[] = [];
				while ((node = walker.nextNode())) {
					if (node.nodeValue === null) continue;
					const textContent = node.nodeValue;
					const clozeRegex =
						/\{\{([a-zA-Z0-9_-]+):((?:(?!\{\{|\}\}).)+)\}\}/g;
					let lastIndex = 0;
					const fragment = document.createDocumentFragment();
					let matchFound = false;
					let match;
					while ((match = clozeRegex.exec(textContent)) !== null) {
						matchFound = true;
						const contentToRender = match[2];
						if (match.index > lastIndex) {
							fragment.appendChild(
								document.createTextNode(
									textContent.substring(
										lastIndex,
										match.index,
									),
								),
							);
						}
						const capsule = document.createElement("span");
						capsule.addClass("fsrs-cloze-capsule");
						const iconPart = capsule.createSpan({
							cls: "fsrs-cloze-icon-part",
						});
						iconPart.setText("❓");
						const textPart = capsule.createSpan({
							cls: "fsrs-cloze-text-part",
						});
						textPart.setText(contentToRender);
						fragment.appendChild(capsule);
						lastIndex = clozeRegex.lastIndex;
					}
					if (matchFound) {
						if (lastIndex < textContent.length) {
							fragment.appendChild(
								document.createTextNode(
									textContent.substring(lastIndex),
								),
							);
						}
						nodesToReplace.push({
							originalNode: node,
							replacementFragment: fragment,
						});
					}
				}
				for (const item of nodesToReplace) {
					item.originalNode.parentNode?.replaceChild(
						item.replacementFragment,
						item.originalNode,
					);
				}
			},
		);

		this.updateUIDisplays();
		this.app.workspace.onLayoutReady(() => {
			this.updateUIDisplays();
			this.intervalId = window.setInterval(
				() => this.updateUIDisplays(),
				5 * 60 * 1000,
			);
			this.registerEvent(
				this.app.metadataCache.on("changed", () =>
					this.updateUIDisplays(),
				),
			);
			this.registerEvent(
				this.app.vault.on("delete", () => this.updateUIDisplays()),
			);
			this.registerEvent(
				this.app.vault.on("rename", () => this.updateUIDisplays()),
			);
		});
	}

	async activateView() {
		this.app.workspace.detachLeavesOfType(FSRS_CALENDAR_VIEW_TYPE);
		const leaf = this.app.workspace.getRightLeaf(true);
		if (leaf) {
			await leaf.setViewState({
				type: FSRS_CALENDAR_VIEW_TYPE,
				active: true,
			});
			this.app.workspace.revealLeaf(leaf);
		}
	}

	onunload() {
		if (this.intervalId) {
			window.clearInterval(this.intervalId);
		}
	}

	async updateUIDisplays(dueCount?: number) {
		if (dueCount === undefined) {
			if (document.querySelector(".quiz-modal-content")) return;
			try {
				dueCount = (await getDueReviewItems(this.getContext())).length;
			} catch (error) {
				console.error("FSRS UI update error:", error);
				return;
			}
		}

		const existingBadge = this.ribbonIconEl.querySelector(
			".ribbon-stats-badge",
		);
		if (existingBadge) existingBadge.remove();
		const tooltip = `Start Quiz Review - ${dueCount} card${dueCount !== 1 ? "s" : ""} due`;
		this.ribbonIconEl.setAttribute("aria-label", tooltip);
		if (dueCount > 0) {
			this.ribbonIconEl
				.createDiv({ cls: "ribbon-stats-badge" })
				.setText(String(dueCount));
		}

		this.statusBarItemEl.setText(`FSRS: ${dueCount} due`);

		this.app.workspace
			.getLeavesOfType(FSRS_CALENDAR_VIEW_TYPE)
			.forEach((leaf) => {
				if (leaf.view instanceof CalendarView) {
					leaf.view.redraw();
				}
			});
	}

	// In main.ts

	async startQuizSession() {
		const dueItems = await getDueReviewItems(this.getContext());
		this.updateUIDisplays(dueItems.length);

		if (dueItems.length === 0) {
			new Notice(
				`No notes with frontmatter key "${this.settings.quizFrontmatterKey}: true" are due.`,
			);
			return;
		}

		const shuffleArray = (array: any[]) => {
			for (let i = array.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[array[i], array[j]] = [array[j], array[i]];
			}
		};
		shuffleArray(dueItems);

		// Open the first modal, passing the entire queue and the total count
		new QuizModal(
			this.app,
			this.getContext(),
			this,
			dueItems,
			dueItems.length,
		).open();
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async updateCardDataInNote(file: TFile, cardId: string, updatedCard: Card) {
		const { body, schedules } = await processFile(this.app, file);
		schedules[cardId] = updatedCard;

		const dataBlockRegex = new RegExp(
			`\n\`\`\`${FSRS_DATA_CODE_BLOCK_TYPE}\\n([\\s\\S]*?)\`\`\``,
		);
		const yamlString = stringifyYaml(schedules);
		let newFileContent: string;

		// Check if the srs-data block already exists in the file
		if ((await this.app.vault.read(file)).match(dataBlockRegex)) {
			// If it exists, just replace its content. This preserves existing spacing.
			const newBlockContent = `\n\`\`\`${FSRS_DATA_CODE_BLOCK_TYPE}\n${yamlString}\`\`\``;
			newFileContent = (await this.app.vault.read(file)).replace(
				dataBlockRegex,
				newBlockContent,
			);
		} else {
			// If it doesn't exist, create it with a separator and clean spacing.
			const separator = `\n\n---\n`;
			const newBlock = `\`\`\`${FSRS_DATA_CODE_BLOCK_TYPE}\n${yamlString}\`\`\``;
			newFileContent = `${body.trim()}${separator}${newBlock}`;
		}

		await this.app.vault.modify(file, newFileContent);
	}
}
