import {
	App,
	Notice,
	Plugin,
	TFile,
	moment,
	MarkdownPostProcessorContext,
	MarkdownView,
	Editor,
	WorkspaceLeaf,
} from "obsidian";
import { fsrs, createEmptyCard, FSRS } from "./fsrs";

import { QuizModal } from "./QuizModal";
import { FsrsSettingTab } from "./FsrsSettingsTab";
import { FsrsPluginSettings, DEFAULT_SETTINGS } from "./settings";
import { CalendarView, FSRS_CALENDAR_VIEW_TYPE } from "./CalendarView";

import {
	ViewPlugin,
	ViewUpdate,
	Decoration,
	DecorationSet,
	WidgetType,
	EditorView,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

const FSRS_DATA_SEPARATOR = "\n---\n";
const QA_SEPARATOR = "\n---\n";

export interface Card {
	due: Date; // Or Date | string if it can be converted. The FSRS functions should clarify this.
	stability: number;
	difficulty: number;
	elapsed_days: number;
	scheduled_days: number;
	reps: number;
	lapses: number;
	state: "new" | "learning" | "review" | "relearning"; // Confirm these states with your FSRS library
}

class ClozeContentWidget extends WidgetType {
	constructor(readonly displayedText: string) {
		super();
	}

	toDOM(view: EditorView): HTMLElement {
		const capsule = document.createElement("span");
		capsule.addClass("fsrs-cloze-capsule");

		const iconPart = capsule.createSpan({ cls: "fsrs-cloze-icon-part" });
		iconPart.setText("?");

		const textPart = capsule.createSpan({ cls: "fsrs-cloze-text-part" });
		textPart.setText(this.displayedText);

		return capsule;
	}

	eq(other: ClozeContentWidget) {
		return other.displayedText === this.displayedText;
	}

	ignoreEvent() {
		return true;
	}
}

function buildClozeViewPlugin(plugin: FsrsPlugin) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			app = plugin.app;
			settings = plugin.settings;

			constructor(view: EditorView) {
				this.decorations = this.buildDecorations(view);
			}

			update(update: ViewUpdate) {
				if (
					update.docChanged ||
					update.viewportChanged ||
					update.selectionSet
				) {
					this.decorations = this.buildDecorations(update.view);
				}
			}

			buildDecorations(view: EditorView): DecorationSet {
				const builder = new RangeSetBuilder<Decoration>();
				const quizKey =
					this.settings.quizFrontmatterKey ||
					DEFAULT_SETTINGS.quizFrontmatterKey;

				const currentFile =
					this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
				if (currentFile) {
					const fileCache =
						this.app.metadataCache.getFileCache(currentFile);
					if (
						!fileCache?.frontmatter ||
						fileCache.frontmatter[quizKey] !== true
					) {
						return Decoration.none;
					}
				} else {
					return Decoration.none;
				}
				const currentSelection = view.state.selection.main;

				for (const { from, to } of view.visibleRanges) {
					const text = view.state.doc.sliceString(from, to);
					const clozeRegex =
						/\{\{([a-zA-Z0-9_-]+):((?:(?!\{\{|\}\}).)+)\}\}/g;
					let match;

					while ((match = clozeRegex.exec(text)) !== null) {
						const matchStartInDoc = from + match.index;
						const matchEndInDoc =
							from + match.index + match[0].length;
						const contentToRender = match[2];

						const selectionOverlapsThisMatch =
							currentSelection.from < matchEndInDoc &&
							currentSelection.to > matchStartInDoc;

						if (selectionOverlapsThisMatch) {
						} else {
							builder.add(
								matchStartInDoc,
								matchEndInDoc,
								Decoration.replace({
									widget: new ClozeContentWidget(
										contentToRender,
									),
								}),
							);
						}
					}
				}
				return builder.finish();
			}
		},
		{
			decorations: (v) => v.decorations,
		},
	);
}

export interface QuizItem {
	file: TFile;
	card: Card;
	identifier: string;
	isCloze: boolean;
	noteBodyForCloze?: string;
	clozeDetails?: { id: string; content: string; rawPlaceholder: string };
	mainQuestion?: string;
	mainAnswer?: string;
	fsrsDataStoreForNote: Record<string, Card> | Card | null;
}

export default class FsrsPlugin extends Plugin {
	settings: FsrsPluginSettings;
	public fsrsInstance: FSRS;
	ribbonIconEl: HTMLElement;
	statusBarItemEl: HTMLElement;
	intervalId: number;

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
			name: "Mark note as quiz (uses frontmatter)",
			hotkeys: [{ modifiers: ["Alt"], key: "Q" }],
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile && activeFile.extension === "md") {
					if (!checking) {
						this.setQuizFrontmatterForActiveNote(activeFile);
					}
					return true;
				}
				return false;
			},
		});

		this.addSettingTab(new FsrsSettingTab(this.app, this));

		this.registerView(
			FSRS_CALENDAR_VIEW_TYPE,
			(leaf) => new CalendarView(leaf, this),
		);

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
		this.registerEditorExtension(buildClozeViewPlugin(this));

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
		const { workspace } = this.app;
		// Remove any existing calendar views to prevent duplicates
		workspace.detachLeavesOfType(FSRS_CALENDAR_VIEW_TYPE);

		// Create a new leaf in the right sidebar. The `true` argument will
		// create a new leaf if one doesn't exist.
		const leaf = workspace.getRightLeaf(true);
		if (!leaf) {
			new Notice("Could not open calendar in the side pane.");
			return;
		}

		// Set the view state for our new leaf
		await leaf.setViewState({
			type: FSRS_CALENDAR_VIEW_TYPE,
			active: true,
		});

		// Reveal the leaf to make sure it's visible
		workspace.revealLeaf(leaf);
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
				dueCount = (await this.getDueReviewItems()).length;
			} catch (error) {
				console.error("FSRS UI update error:", error);
				return;
			}
		}

		// 1. Update Ribbon Icon Badge
		const existingBadge = this.ribbonIconEl.querySelector(
			".ribbon-stats-badge",
		);
		if (existingBadge) existingBadge.remove();
		const tooltip = `Start Quiz Review - ${dueCount} card${dueCount !== 1 ? "s" : ""} due`;
		this.ribbonIconEl.setAttribute("aria-label", tooltip);
		if (dueCount > 0) {
			const badge = this.ribbonIconEl.createDiv({
				cls: "ribbon-stats-badge",
			});
			badge.setText(String(dueCount));
		}

		// 2. Update Status Bar
		this.statusBarItemEl.setText(`FSRS: ${dueCount} due`);
		this.statusBarItemEl.setAttribute(
			"aria-label",
			`${dueCount} cards due for review`,
		);

		// 3. Update any open calendar views
		const leaves = this.app.workspace.getLeavesOfType(
			FSRS_CALENDAR_VIEW_TYPE,
		);
		for (const leaf of leaves) {
			if (leaf.view instanceof CalendarView) {
				await leaf.view.redraw();
			}
		}
	}

	async getDueReviewItems(): Promise<QuizItem[]> {
		const quizNotes = await this.getQuizNotes();
		const now = new Date();
		const dueItems: QuizItem[] = [];

		for (const noteFile of quizNotes) {
			const rawFileContent = await this.app.vault.read(noteFile);
			let bodyContentOnly = rawFileContent;
			const fileCache = this.app.metadataCache.getFileCache(noteFile);
			const yamlEndOffset = fileCache?.frontmatterPosition?.end?.offset;
			if (
				yamlEndOffset &&
				yamlEndOffset > 0 &&
				yamlEndOffset <= rawFileContent.length
			) {
				bodyContentOnly = rawFileContent.substring(yamlEndOffset);
			}
			bodyContentOnly = bodyContentOnly.trimStart();

			const {
				question,
				answer,
				fsrsData,
				existingContent,
				identifiedClozes,
			} = this.parseNoteContent(bodyContentOnly);

			if (identifiedClozes.length > 0) {
				let fsrsDataMapForClozes: Record<string, Card> = {};
				if (
					fsrsData &&
					typeof fsrsData === "object" &&
					!Array.isArray(fsrsData)
				) {
					const keys = Object.keys(fsrsData);
					const looksLikeSingleCard =
						fsrsData.hasOwnProperty("due") &&
						fsrsData.hasOwnProperty("stability");
					if (
						looksLikeSingleCard &&
						keys.length < 8 &&
						!Object.values(fsrsData).some(
							(v: any) =>
								typeof v === "object" &&
								v &&
								v.hasOwnProperty("due"),
						)
					) {
					} else if (!looksLikeSingleCard || keys.length > 0) {
						fsrsDataMapForClozes = fsrsData as Record<string, Card>;
					}
				}

				for (const cloze of identifiedClozes) {
					const card: Card =
						fsrsDataMapForClozes[cloze.id] ||
						(createEmptyCard(now) as Card);
					const dueDate =
						typeof card.due === "string"
							? new Date(card.due)
							: card.due;
					if (
						dueDate instanceof Date &&
						!isNaN(dueDate.getTime()) &&
						dueDate <= now
					) {
						dueItems.push({
							file: noteFile,
							card,
							identifier: cloze.id,
							isCloze: true,
							noteBodyForCloze: existingContent,
							clozeDetails: cloze,
							fsrsDataStoreForNote: fsrsDataMapForClozes,
							mainQuestion: question,
							mainAnswer: answer,
						});
					}
				}
			} else {
				if (!question && !answer) continue;

				let cardForSimpleNote: Card =
					fsrsData &&
					typeof fsrsData === "object" &&
					fsrsData.hasOwnProperty("due")
						? (fsrsData as Card)
						: (createEmptyCard(now) as Card);
				const dueDate =
					typeof cardForSimpleNote.due === "string"
						? new Date(cardForSimpleNote.due)
						: cardForSimpleNote.due;
				if (
					dueDate instanceof Date &&
					!isNaN(dueDate.getTime()) &&
					dueDate <= now
				) {
					dueItems.push({
						file: noteFile,
						card: cardForSimpleNote,
						identifier: "_default",
						isCloze: false,
						mainQuestion: question,
						mainAnswer: answer,
						noteBodyForCloze: existingContent,
						fsrsDataStoreForNote: cardForSimpleNote,
					});
				}
			}
		}
		return dueItems;
	}

	async startQuizSession() {
		const dueItems = await this.getDueReviewItems();
		this.updateUIDisplays(dueItems.length);

		if (dueItems.length === 0) {
			new Notice(
				`No notes with frontmatter key "${this.settings.quizFrontmatterKey}: true" are due.`,
			);
			return;
		}

		const shuffleArray = (array: QuizItem[]) => {
			for (let i = array.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[array[i], array[j]] = [array[j], array[i]];
			}
		};
		shuffleArray(dueItems);

		new QuizModal(this.app, this, dueItems[0]).open();
	}

	async setQuizFrontmatterForActiveNote(file: TFile) {
		const quizKey = this.settings.quizFrontmatterKey || "quiz";
		try {
			await this.app.fileManager.processFrontMatter(file, (fm: any) => {
				if (typeof fm === "object" && fm !== null) {
					if (fm[quizKey] === true) {
						new Notice(`"${file.basename}" is already a quiz.`);
					} else {
						fm[quizKey] = true;
						new Notice(`Marked "${file.basename}" as a quiz.`);
					}
				} else {
					new Notice(
						`Frontmatter in "${file.basename}" is malformed.`,
					);
				}
			});
		} catch (error) {
			new Notice(`Error processing frontmatter for "${file.basename}".`);
		}
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

	async getQuizNotes(): Promise<TFile[]> {
		const allFiles = this.app.vault.getMarkdownFiles();
		const quizNotes: TFile[] = [];
		const quizKey = this.settings.quizFrontmatterKey || "quiz";
		for (const file of allFiles) {
			const fileCache = this.app.metadataCache.getFileCache(file);
			if (
				fileCache?.frontmatter &&
				fileCache.frontmatter[quizKey] === true
			) {
				quizNotes.push(file);
			}
		}
		return quizNotes;
	}

	parseNoteContent(content: string) {
		let question = "";
		let answer = "";
		let fsrsData: any = null;
		let contentForQaParsing = content;
		const identifiedClozes: {
			id: string;
			content: string;
			rawPlaceholder: string;
		}[] = [];
		const clozeRegex = /\{\{([a-zA-Z0-9_-]+):((?:(?!\{\{|\}\}).)+)\}\}/g;
		const parts = content.split(FSRS_DATA_SEPARATOR);
		if (parts.length > 1) {
			const lastSegment = parts[parts.length - 1].trim();
			if (
				lastSegment.startsWith("```json") &&
				lastSegment.endsWith("```")
			) {
				try {
					const jsonString = lastSegment
						.substring(7, lastSegment.length - 3)
						.trim();
					fsrsData = JSON.parse(jsonString);
					contentForQaParsing = parts
						.slice(0, parts.length - 1)
						.join(FSRS_DATA_SEPARATOR);
				} catch (e) {
					fsrsData = null;
					contentForQaParsing = content;
				}
			} else {
				contentForQaParsing = content;
			}
		} else {
			contentForQaParsing = content;
		}

		let match;
		while ((match = clozeRegex.exec(contentForQaParsing)) !== null) {
			identifiedClozes.push({
				id: match[1],
				content: match[2],
				rawPlaceholder: match[0],
			});
		}

		const qaParts = contentForQaParsing.split(QA_SEPARATOR);
		question = qaParts[0].trim();
		if (qaParts.length > 1) {
			answer = qaParts.slice(1).join(QA_SEPARATOR).trim();
		}

		if (identifiedClozes.length > 0 && fsrsData === null) {
			fsrsData = {};
		}

		return {
			question,
			answer,
			fsrsData,
			existingContent: contentForQaParsing.trim(),
			identifiedClozes,
		};
	}

	async writeFsrsDataToNote(
		noteFile: TFile,
		originalFrontmatter: string,
		originalBodyWithoutFsrs: string,
		dataToWrite: Record<string, any> | Card | null,
	) {
		if (dataToWrite === null) return;

		const fsrsJsonString = JSON.stringify(dataToWrite, null, 2);
		const newFsrsBlock = `\n\n---\n\`\`\`json\n${fsrsJsonString}\n\`\`\``;
		const newBodyContentWithFsrs =
			originalBodyWithoutFsrs.trim() + newFsrsBlock;
		let finalNoteContent: string;

		if (originalFrontmatter.length > 0) {
			finalNoteContent = originalFrontmatter.endsWith("\n")
				? originalFrontmatter + newBodyContentWithFsrs
				: originalFrontmatter + "\n" + newBodyContentWithFsrs;
		} else {
			finalNoteContent = newBodyContentWithFsrs;
		}
		await this.app.vault.modify(noteFile, finalNoteContent);
	}
}
