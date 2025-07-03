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
	parseYaml,
	stringifyYaml,
	setIcon,
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

const FSRS_DATA_CODE_BLOCK_TYPE = "srs-data";
const FSRS_CARD_MARKER = "?srs";
const FSRS_CARD_END_MARKER = "?srs(end)";

export interface Card {
	due: Date;
	stability: number;
	difficulty: number;
	elapsed_days: number;
	scheduled_days: number;
	reps: number;
	lapses: number;
	state: "new" | "learning" | "review" | "relearning";
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
				if (!currentFile) return Decoration.none;

				const fileCache =
					this.app.metadataCache.getFileCache(currentFile);
				if (
					!fileCache?.frontmatter ||
					fileCache.frontmatter[quizKey] !== true
				) {
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

						if (
							!(
								currentSelection.from < matchEndInDoc &&
								currentSelection.to > matchStartInDoc
							)
						) {
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

class QuestionLineWidget extends WidgetType {
	constructor(
		readonly questionText: string,
		readonly style: string | undefined,
	) {
		super();
	}

	toDOM(view: EditorView): HTMLElement {
		// The main container for the line, with the desired paragraph class
		const lineEl = document.createElement("div");
		lineEl.className = "fsrs-question-paragraph";

		// The actual question text
		const textEl = lineEl.createSpan();
		textEl.innerText = this.questionText;

		// The capsule widget at the end
		const capsuleWidget = new SrsCapsuleWidget(this.style);
		const capsuleEl = capsuleWidget.toDOM(view);
		lineEl.appendChild(capsuleEl);

		return lineEl;
	}

	ignoreEvent() {
		return true;
	}
}

class SrsCapsuleWidget extends WidgetType {
	constructor(readonly style: string | undefined) {
		super();
	}

	toDOM(view: EditorView): HTMLElement {
		const styleDetails = this.getStyleDetails();

		const capsule = document.createElement("span");
		capsule.addClass(
			"fsrs-cloze-capsule",
			"fsrs-srs-capsule",
			styleDetails.className,
		);

		if (this.style === "end") {
			const iconPart = capsule.createSpan({
				cls: "fsrs-cloze-icon-part",
			});
			setIcon(iconPart, styleDetails.icon);
		} else {
			const iconPart = capsule.createSpan({
				cls: "fsrs-cloze-icon-part",
			});
			setIcon(iconPart, "brain");

			// The text part now gets an additional 'has-icon' class
			const textPart = capsule.createSpan({
				cls: ["fsrs-cloze-text-part", "has-icon"],
			});
			const styleIconEl = textPart.createSpan();
			setIcon(styleIconEl, styleDetails.icon);
		}

		capsule.setAttribute("aria-label", styleDetails.hoverText);
		capsule.classList.add("has-tooltip");

		return capsule;
	}

	getStyleDetails(): {
		icon: string;
		hoverText: string;
		className: string;
	} {
		switch (this.style) {
			case "end":
				return {
					icon: "ban",
					hoverText: "End of Card",
					className: "fsrs-srs-style-end",
				};
			default:
				return {
					icon: "help-circle",
					hoverText: "Simple Question",
					className: "fsrs-srs-style-default",
				};
		}
	}

	eq(other: SrsCapsuleWidget) {
		return other.style === this.style;
	}

	ignoreEvent() {
		return true;
	}
}

function buildSrsMarkerViewPlugin(plugin: FsrsPlugin) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

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
					plugin.settings.quizFrontmatterKey ||
					DEFAULT_SETTINGS.quizFrontmatterKey;

				const currentFile =
					plugin.app.workspace.getActiveViewOfType(
						MarkdownView,
					)?.file;
				if (!currentFile) return Decoration.none;

				const fileCache =
					plugin.app.metadataCache.getFileCache(currentFile);
				if (!fileCache?.frontmatter?.[quizKey]) {
					return Decoration.none;
				}

				const selection = view.state.selection.main;
				const questionRegex =
					/[ \t]+\?srs(?:\(([\w-]+)\))?(\s+\^[a-zA-Z0-9]+)?$/;
				const endRegex = new RegExp(
					`^${FSRS_CARD_END_MARKER.replace(
						/[.*+?^${}()|[\]\\]/g,
						"\\$&",
					)}$`,
				);

				for (const { from, to } of view.visibleRanges) {
					let pos = from;
					while (pos <= to) {
						const line = view.state.doc.lineAt(pos);

						const questionMatch = line.text.match(questionRegex);
						const endMatch = line.text.match(endRegex);

						if (questionMatch && questionMatch.index) {
							const markerStart = line.from + questionMatch.index;
							const markerEnd =
								markerStart + questionMatch[0].length;
							const selectionOverlaps =
								selection.from < markerEnd &&
								selection.to > markerStart;

							if (!selectionOverlaps) {
								// Apply a container class to the whole line
								builder.add(
									line.from,
									line.from,
									Decoration.line({
										attributes: {
											class: "fsrs-question-container",
										},
									}),
								);
								// Then, replace only the marker with the widget
								const style = questionMatch[1] || undefined;
								builder.add(
									markerStart,
									markerEnd,
									Decoration.replace({
										widget: new SrsCapsuleWidget(style),
									}),
								);
							}
						} else if (endMatch) {
							const selectionOverlaps =
								selection.from <= line.to &&
								selection.to >= line.from;
							if (!selectionOverlaps) {
								builder.add(
									line.from,
									line.to,
									Decoration.replace({
										widget: new SrsCapsuleWidget("end"),
									}),
								);
							}
						}
						pos = line.to + 1;
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
	id: string;
	isCloze: boolean;
	question: string;
	answer: string;
	rawQuestionText?: string;
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
			name: "Mark as quiz / Add card marker",
			hotkeys: [{ modifiers: ["Alt"], key: "Q" }],
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
			(leaf) => new CalendarView(leaf, this),
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

	async dailyReset() {
		const today = moment().format("YYYY-MM-DD");
		if (this.settings.lastReviewDate !== today) {
			this.settings.lastReviewDate = today;
			this.settings.newCardsReviewedToday = 0;
			await this.saveSettings();
		}
	}

	async incrementNewCardCount(count: number = 1) {
		await this.dailyReset(); // Ensure we're on the correct day
		this.settings.newCardsReviewedToday += count;
		await this.saveSettings();
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
	async getDueReviewItems(): Promise<QuizItem[]> {
		await this.dailyReset();

		const allItems = await this.getAllReviewItems();
		const now = new Date();

		const dueReviews: QuizItem[] = [];
		const allNewCards: QuizItem[] = [];

		// Partition all items into either new or scheduled
		for (const item of allItems) {
			// A card is considered new if its state is literally "new" or if it has no state property.
			if (item.card.state === "new" || !item.card.state) {
				allNewCards.push(item);
			} else {
				// It's a scheduled card, so check if it's due.
				const dueDate =
					typeof item.card.due === "string"
						? new Date(item.card.due)
						: item.card.due;
				if (
					dueDate instanceof Date &&
					!isNaN(dueDate.getTime()) &&
					dueDate <= now
				) {
					dueReviews.push(item);
				}
			}
		}

		// Determine how many new cards can be shown today
		const newCardsAvailable =
			this.settings.maxNewCardsPerDay -
			this.settings.newCardsReviewedToday;
		const newCardsForSession =
			newCardsAvailable > 0
				? allNewCards.slice(0, newCardsAvailable)
				: [];

		// The final queue is all due reviews plus the capped number of new cards
		return [...dueReviews, ...newCardsForSession];
	}

	async getAllReviewItems(): Promise<QuizItem[]> {
		const quizNotes = await this.getQuizNotes();
		const allItems: QuizItem[] = [];
		const now = new Date();

		for (const noteFile of quizNotes) {
			const { body, schedules } = await this.parseFileContent(noteFile);

			const lines = body.split("\n");
			let currentQuestion = "";
			let currentAnswer = "";
			let currentBlockId = "";
			let inAnswer = false;

			for (const line of lines) {
				const srsMarkerIndex = line.indexOf(FSRS_CARD_MARKER);

				if (srsMarkerIndex !== -1) {
					if (currentQuestion && currentBlockId) {
						const card =
							schedules[currentBlockId] ||
							(createEmptyCard(now) as Card);
						allItems.push({
							file: noteFile,
							id: currentBlockId,
							card,
							isCloze: false,
							question: currentQuestion.trim(),
							answer: currentAnswer.trim(),
						});
					}

					currentQuestion = line.substring(0, srsMarkerIndex);
					const blockIdMatch = line.match(/\^([a-zA-Z0-9]+)$/);
					currentBlockId = blockIdMatch ? blockIdMatch[1].trim() : "";
					currentAnswer = "";
					inAnswer = true;
				} else if (inAnswer) {
					if (line.trim() === FSRS_CARD_END_MARKER) {
						if (currentQuestion && currentBlockId) {
							const card =
								schedules[currentBlockId] ||
								(createEmptyCard(now) as Card);
							allItems.push({
								file: noteFile,
								id: currentBlockId,
								card,
								isCloze: false,
								question: currentQuestion.trim(),
								answer: currentAnswer.trim(),
							});
						}
						currentQuestion = "";
						currentAnswer = "";
						currentBlockId = "";
						inAnswer = false;
					} else {
						currentAnswer += line + "\n";
					}
				}
			}

			if (currentQuestion && currentBlockId) {
				const card =
					schedules[currentBlockId] || (createEmptyCard(now) as Card);
				allItems.push({
					file: noteFile,
					id: currentBlockId,
					card,
					isCloze: false,
					question: currentQuestion.trim(),
					answer: currentAnswer.trim(),
				});
			}

			// Cloze card parsing remains unchanged
			const clozeRegex = /\{\{([a-zA-Z0-9_-]+)::((?:.|\n)*?)\}\}/g;
			let match;
			while ((match = clozeRegex.exec(body)) !== null) {
				const clozeId = match[1];
				const clozeContent = match[2];
				const card =
					schedules[clozeId] || (createEmptyCard(now) as Card);
				allItems.push({
					file: noteFile,
					id: clozeId,
					card,
					isCloze: true,
					question: body,
					answer: clozeContent,
					rawQuestionText: body,
				});
			}
		}
		return allItems;
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

		const shuffleArray = (array: any[]) => {
			for (let i = array.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[array[i], array[j]] = [array[j], array[i]];
			}
		};
		shuffleArray(dueItems);

		// Open the first modal, passing the entire queue and the total count
		new QuizModal(this.app, this, dueItems, dueItems.length).open();
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
		const quizKey = this.settings.quizFrontmatterKey || "quiz";
		return allFiles.filter((file) => {
			const fileCache = this.app.metadataCache.getFileCache(file);
			return fileCache?.frontmatter?.[quizKey] === true;
		});
	}

	async parseFileContent(noteFile: TFile): Promise<{
		body: string;
		schedules: Record<string, Card>;
	}> {
		let fileContent = await this.app.vault.read(noteFile);
		const dataBlockRegex = new RegExp(
			`\n\`\`\`${FSRS_DATA_CODE_BLOCK_TYPE}\\n([\\s\\S]*?)\`\`\``,
		);
		const match = fileContent.match(dataBlockRegex);

		let body = fileContent;
		let schedules: Record<string, Card> = {};

		if (match) {
			body = fileContent.substring(0, match.index);
			try {
				schedules = parseYaml(match[1]) || {};
			} catch (e) {
				console.error(
					`FSRS: Error parsing YAML in ${noteFile.path}`,
					e,
				);
			}
		}

		const lines = body.split("\n");
		let needsWrite = false;
		for (let i = 0; i < lines.length; i++) {
			const trimmedLine = lines[i].trim();
			if (
				trimmedLine.includes(FSRS_CARD_MARKER) &&
				trimmedLine !== FSRS_CARD_END_MARKER &&
				!/\^\w+$/.test(trimmedLine)
			) {
				const newId = `${Date.now().toString(36)}${Math.random()
					.toString(36)
					.substring(2, 5)}`;
				lines[i] = `${trimmedLine} ^${newId}`;
				needsWrite = true;
			}
		}

		if (needsWrite) {
			const updatedBody = lines.join("\n");
			const finalContent = match
				? `${updatedBody}${match[0]}`
				: updatedBody;
			await this.app.vault.modify(noteFile, finalContent);
			return { body: updatedBody, schedules };
		}

		return { body, schedules };
	}

	async updateCardDataInNote(file: TFile, cardId: string, updatedCard: Card) {
		const { body, schedules } = await this.parseFileContent(file);
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
