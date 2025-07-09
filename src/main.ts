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

import { load as parseYaml } from "js-yaml";
import { fsrs, createEmptyCard, FSRS } from "./libs/fsrs";
import { QuizModal } from "./ui/QuizModal";
import { QuestionBrowserModal } from "./ui/QuestionBrowserModal";
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
import { getDueReviewItems, getAllReviewItems } from "./logic/scheduler";
import { processFile } from "./logic/parser";
import {
	FSRS_CARD_END_MARKER,
	FSRS_CARD_MARKER,
	FSRS_DATA_CODE_BLOCK_TYPE,
	FSRS_CRAM_CARD_MARKER,
} from "./logic/consts";

export default class FsrsPlugin extends Plugin {
	settings: FsrsPluginSettings;
	public fsrsInstance: FSRS;
	ribbonIconEl: HTMLElement;
	statusBarItemEl: HTMLElement;
	intervalId: number;
	private allQuizItems: QuizItem[] = [];
	private isCacheValid: boolean = false;

	public async getQuizItems(
		forceReload: boolean = false,
	): Promise<QuizItem[]> {
		if (this.isCacheValid && !forceReload) {
			return this.allQuizItems;
		}

		this.allQuizItems = await getAllReviewItems(this.getContext());
		this.isCacheValid = true;
		return this.allQuizItems;
	}

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
		this.ribbonIconEl = this.addRibbonIcon("brain", "Start review", () => {
			this.startQuizSession();
		});
		this.ribbonIconEl.addClass("fsrs-ribbon-icon");

		this.addRibbonIcon("folder-search", "Browse Questions", () => {
			new QuestionBrowserModal(this.app, this.getContext(), this).open();
		});

		this.addCommand({
			id: "start-fsrs-quiz-review",
			name: "Start review",
			callback: () => {
				this.startQuizSession();
			},
		});

		this.addCommand({
			id: "simple-fsrs-browse-questions",
			name: "Browse all questions",
			callback: () => {
				new QuestionBrowserModal(
					this.app,
					this.getContext(),
					this,
				).open();
			},
		});

		this.addCommand({
			id: "open-fsrs-calendar-view",
			name: "Open calendar",
			callback: () => {
				this.activateView();
			},
		});

		this.addCommand({
			id: "mark-as-quiz-cloze",
			name: "Omni command",
			hotkeys: [{ modifiers: ["Alt"], key: "q" }],
			icon: "brain-circuit",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				if (!view.file) return;

				const fileCache = this.app.metadataCache.getFileCache(
					view.file,
				);
				const quizKey = this.settings.fsrsFrontmatterKey || "fsrs";
				const isQuizNote = fileCache?.frontmatter?.[quizKey] === true;

				if (!isQuizNote) {
					await this.app.fileManager.processFrontMatter(
						view.file,
						(fm) => {
							fm[quizKey] = true;
						},
					);
					/*new Notice(
						`Marked "${view.file.basename}" as a quiz note.`,
					);*/
				}

				const selection = editor.getSelection();
				const cursor = editor.getCursor();
				const line = editor.getLine(cursor.line);

				if (selection) {
					// Text is selected, wrap it as a cloze
					const clozeText = `::${selection}::`;
					editor.replaceSelection(clozeText);

					// Add the question marker if it's not already there
					const updatedLine = editor.getLine(cursor.line);
					if (!updatedLine.includes(FSRS_CARD_MARKER)) {
						editor.setLine(
							cursor.line,
							`${updatedLine} ${FSRS_CARD_MARKER}`,
						);
					}
					// Move cursor to the end of the line
					editor.setCursor({
						line: cursor.line,
						ch: editor.getLine(cursor.line).length,
					});
				} else if (line.trim() === "") {
					editor.setLine(cursor.line, FSRS_CARD_END_MARKER);
				} else if (line.includes(FSRS_CRAM_CARD_MARKER)) {
					// Cycle from cram to regular
					// The order of these checks is important, as FSRS_CRAM_CARD_MARKER includes FSRS_CARD_MARKER
					const newLine = line.replace(
						FSRS_CRAM_CARD_MARKER,
						FSRS_CARD_MARKER,
					);
					editor.setLine(cursor.line, newLine);
				} else if (line.includes(FSRS_CARD_MARKER)) {
					// Cycle from regular to cram
					const newLine = line.replace(
						FSRS_CARD_MARKER,
						FSRS_CRAM_CARD_MARKER,
					);
					editor.setLine(cursor.line, newLine);
				} else {
					// Add a new marker if none exists
					const newId = `^${Date.now().toString(36)}${Math.random().toString(36).substring(2, 5)}`;
					const newLine = `${line.trim()} ${FSRS_CARD_MARKER} ${newId}`;
					editor.setLine(cursor.line, newLine);
					editor.setCursor({ line: cursor.line, ch: newLine.length });
				}
			},
		});

		this.addSettingTab(new FsrsSettingTab(this.app, this));
		this.registerView(
			FSRS_CALENDAR_VIEW_TYPE,
			(leaf) => new CalendarView(leaf, this.getContext(), this),
		);
		this.registerEditorExtension(buildClozeViewPlugin(this));
		this.registerEditorExtension(buildSrsMarkerViewPlugin(this));
		this.registerMarkdownPostProcessor(
			(element: HTMLElement, context: MarkdownPostProcessorContext) => {
				const quizKey =
					this.settings.fsrsFrontmatterKey ||
					DEFAULT_SETTINGS.fsrsFrontmatterKey;
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

		this.app.workspace.onLayoutReady(() => {
			this.updateUIDisplays();
			this.intervalId = window.setInterval(
				() => this.updateUIDisplays(),
				60 * 1000, // Once a minute
			);
			const onFileChange = () => {
				this.isCacheValid = false;
				this.updateUIDisplays();
			};

			this.registerEvent(
				this.app.metadataCache.on("changed", (file, data, cache) => {
					const quizKey = this.settings.fsrsFrontmatterKey || "fsrs";
					if (
						cache.frontmatter &&
						cache.frontmatter.hasOwnProperty(quizKey)
					) {
						getAllReviewItems(this.getContext(), [file]).then(
							(items) => {
								const questionCount = items.length;
								if (
									cache.frontmatter[quizKey] !== questionCount
								) {
									this.app.fileManager.processFrontMatter(
										file,
										(fm) => {
											fm[quizKey] = questionCount;
										},
									);
								}
							},
						);
					}
					onFileChange();
				}),
			);
			this.registerEvent(this.app.vault.on("modify", onFileChange));
			this.registerEvent(this.app.vault.on("delete", onFileChange));
			this.registerEvent(this.app.vault.on("rename", onFileChange));
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

	async updateUIDisplays() {
		// No need for a dueCount parameter anymore, we get it from the cache
		if (document.querySelector(".quiz-modal-content")) return;
		try {
			const allItems = await this.getQuizItems();
			const dueCount = (
				await getDueReviewItems(this.getContext(), allItems)
			).length;

			const existingBadge = this.ribbonIconEl.querySelector(
				".ribbon-stats-badge",
			);
			if (existingBadge) existingBadge.remove();
			const tooltip = `Start review - ${dueCount} card${dueCount !== 1 ? "s" : ""} due`;
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
		} catch (error) {
			console.error("FSRS UI update error:", error);
			return;
		}
	}

	async startQuizSession(items?: QuizItem[]) {
		if (!items) {
			const allItems = await this.getQuizItems();
			const dueItems = await getDueReviewItems(
				this.getContext(),
				allItems,
			);
			this.updateUIDisplays();

			if (dueItems.length === 0) {
				new Notice(
					`No notes with frontmatter key "${this.settings.fsrsFrontmatterKey}: true" are due.`,
				);
				return;
			}
			items = dueItems;
		}

		const shuffleArray = (array: any[]) => {
			for (let i = array.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[array[i], array[j]] = [array[j], array[i]];
			}
		};
		shuffleArray(items);

		// Open the first modal, passing the entire queue and the total count
		new QuizModal(
			this.app,
			this.getContext(),
			this,
			items,
			items.length,
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
			// If it doesn't exist, create it with clean spacing.
			const separator = `\n\n`;
			const newBlock = `\`\`\`${FSRS_DATA_CODE_BLOCK_TYPE}\n${yamlString}\`\`\``;
			newFileContent = `${body.trim()}${separator}${newBlock}`;
		}

		await this.app.vault.modify(file, newFileContent);
		this.isCacheValid = false;
	}
}
