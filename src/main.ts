import {
	App,
	Notice,
	Plugin,
	TFile,
	moment,
	MarkdownPostProcessorContext,
} from "obsidian";
import { fsrs, createEmptyCard, FSRS } from "./fsrs";

import { QuizModal } from "./QuizModal";
import { FsrsSettingTab } from "./FsrsSettingsTab";
import { FsrsPluginSettings, DEFAULT_SETTINGS } from "./settings";
import {
	// ... your existing obsidian imports ...
	MarkdownView, // To check current view mode
	Editor, // For editor extension context
} from "obsidian";

import {
	ViewPlugin,
	ViewUpdate,
	Decoration,
	DecorationSet,
	WidgetType,
	EditorView, // For type hinting in Widget
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

const FSRS_DATA_SEPARATOR = "\n---\n";
const QA_SEPARATOR = "\n---\n";

class ClozeContentWidget extends WidgetType {
	constructor(readonly displayedText: string) {
		super();
	}

	toDOM(view: EditorView): HTMLElement {
		const capsule = document.createElement("span");
		capsule.addClass("fsrs-cloze-capsule");

		const iconPart = capsule.createSpan({ cls: "fsrs-cloze-icon-part" });
		iconPart.setText("?"); // Or your preferred icon/glyph

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
	// Pass your plugin instance for settings/app access
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			app = plugin.app; // Store app reference
			settings = plugin.settings; // Store settings reference

			constructor(view: EditorView) {
				this.decorations = this.buildDecorations(view);
			}

			update(update: ViewUpdate) {
				if (
					update.docChanged ||
					update.viewportChanged ||
					update.selectionSet
				) {
					// More targeted updates can be done by checking update.flags
					// For simplicity, rebuilding on common changes.
					// Could also check if frontmatter changed if we had a state field for it.
					this.decorations = this.buildDecorations(update.view);
				}
			}

			buildDecorations(view: EditorView): DecorationSet {
				const builder = new RangeSetBuilder<Decoration>();
				const quizKey =
					this.settings.quizFrontmatterKey ||
					DEFAULT_SETTINGS.quizFrontmatterKey;

				// Get current file and check its frontmatter
				const currentFile =
					this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
				if (currentFile) {
					const fileCache =
						this.app.metadataCache.getFileCache(currentFile);
					if (
						!fileCache?.frontmatter ||
						fileCache.frontmatter[quizKey] !== true
					) {
						return Decoration.none; // Not a quiz note, no decorations
					}
				} else {
					return Decoration.none; // No active file or not a markdown view
				}
				const currentSelection = view.state.selection.main; // Get the primary selection/cursor

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

						// --- BEGIN Condition for Editing ---
						// Check if the main cursor is within this specific match's range
						// or if the selection overlaps with this match.
						const cursorInsideThisMatch =
							currentSelection.from >= matchStartInDoc &&
							currentSelection.to <= matchEndInDoc;
						// More robust overlap check:
						const selectionOverlapsThisMatch =
							currentSelection.from < matchEndInDoc &&
							currentSelection.to > matchStartInDoc;
						// --- END Condition for Editing ---

						if (selectionOverlapsThisMatch) {
							// Cursor/selection is inside this cloze, so don't apply special rendering.
							// Let it display as raw text for editing.
							// Optionally, you could add a different decoration, e.g., a subtle background
							// to indicate it's an "active" cloze being edited.
							// builder.add(matchStartInDoc, matchEndInDoc, Decoration.mark({ class: "cloze-being-edited" }));
						} else {
							// Cursor is outside, apply the replacement widget.
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

export interface QuizItem {
	file: TFile;
	card: Card; // The specific FSRS card for this item
	identifier: string; // "_default" for main Q/A, or the cloze ID
	isCloze: boolean;
	// For clozes:
	noteBodyForCloze?: string; // The entire note body (pre-FSRS block) to construct the cloze question
	clozeDetails?: { id: string; content: string; rawPlaceholder: string }; // Details of the specific cloze
	// For simple Q/A:
	mainQuestion?: string;
	mainAnswer?: string;
	// The complete FSRS data structure for the *entire note*
	// This is what gets saved back. For cloze notes, it's a map. For simple notes, it's the single card.
	fsrsDataStoreForNote: Record<string, Card> | Card | null;
}

export default class FsrsPlugin extends Plugin {
	settings: FsrsPluginSettings;
	public fsrsInstance: FSRS;
	async onload() {
		await this.loadSettings();

		this.fsrsInstance = fsrs({});

		this.addRibbonIcon("brain", "Start Quiz Review", () => {
			this.startQuizSession();
		});

		this.addCommand({
			id: "start-fsrs-quiz-review",
			name: "Start FSRS Quiz Review",

			callback: () => {
				this.startQuizSession();
			},
		});

		this.addCommand({
			id: "set-note-as-quiz-frontmatter",
			name: "Mark note as quiz (uses frontmatter)",
			hotkeys: [
				// Add this hotkeys array
				{
					modifiers: ["Alt"], // "Mod" is Cmd on Mac, Ctrl on Win/Linux
					key: "Q",
				},
			],
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				// Ensure there's an active markdown file
				if (activeFile && activeFile.extension === "md") {
					if (!checking) {
						// If not just checking, execute the command
						this.setQuizFrontmatterForActiveNote(activeFile);
					}
					return true; // Command is available
				}
				return false; // Command is not available (e.g., no active md file)
			},
		});

		// In FsrsPlugin class

		// In FsrsPlugin class

		// Potentially add a setting tab for quizTag etc.
		this.addSettingTab(new FsrsSettingTab(this.app, this));

		// Inside FsrsPlugin class in main.ts, within the onload method:

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
					// Only log if there's a hint of cloze syntax to reduce noise
					if (textContent.includes("{{")) {
						console.log(
							`[FSRS Cloze PP Debug] Text node content: "${textContent}"`,
						);
					}

					const clozeRegex =
						/\{\{([a-zA-Z0-9_-]+):((?:(?!\{\{|\}\}).)+)\}\}/g;
					let lastIndex = 0;
					const fragment = document.createDocumentFragment();
					let matchFound = false;
					let match;

					while ((match = clozeRegex.exec(textContent)) !== null) {
						matchFound = true;
						const contentToRender = match[2];
						console.log(
							`[FSRS Cloze PP Debug] Found cloze content to render: "${contentToRender}" in text node "${textContent}"`,
						);

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
						capsule.addClass("fsrs-cloze-capsule"); // Use the same outer class

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

				if (nodesToReplace.length > 0) {
					console.log(
						`[FSRS Cloze PP Debug] Attempting to replace ${nodesToReplace.length} node(s)`,
					);
					for (const item of nodesToReplace) {
						item.originalNode.parentNode?.replaceChild(
							item.replacementFragment,
							item.originalNode,
						);
					}
				}
			},
		);
		// --- END MarkdownPostProcessor for Cloze Syntax ---
		const clozeViewPluginExtension = buildClozeViewPlugin(this);
		this.registerEditorExtension(clozeViewPluginExtension);
	}

	async setQuizFrontmatterForActiveNote(file: TFile) {
		// Ensure you have 'quizFrontmatterKey' defined in your settings interface and DEFAULT_SETTINGS
		// For example, in FsrsPluginSettings: quizFrontmatterKey: string;
		// And in DEFAULT_SETTINGS: quizFrontmatterKey: 'quiz',
		const quizKey = this.settings.quizFrontmatterKey || "quiz"; // Get key from settings

		try {
			await this.app.fileManager.processFrontMatter(file, (fm: any) => {
				// 'fm' is the frontmatter object given by Obsidian.
				// If no frontmatter exists, 'fm' is usually an empty object: {}.
				// If frontmatter is malformed, 'fm' might be null or not a typical object.

				if (typeof fm === "object" && fm !== null) {
					// Frontmatter is a valid object, we can work with it.
					if (fm[quizKey] === true) {
						new Notice(
							`"${file.basename}" is already marked as a quiz.`,
						);
					} else {
						fm[quizKey] = true; // Set the key to true
						new Notice(
							`Marked "${file.basename}" as a quiz using frontmatter.`,
						);
					}
				} else {
					// Frontmatter is null or not an object (e.g., severely malformed YAML).
					// In this case, we cannot safely modify 'fm' by just setting a key.
					// We'll inform the user and avoid making changes to prevent data loss
					// or further corruption of the frontmatter.
					// If you wanted to *overwrite* malformed frontmatter, that would be a more
					// complex operation requiring clearing 'fm's keys (if it was an object)
					// or handling the 'null' case to signal replacement.
					new Notice(
						`Frontmatter in "${file.basename}" is malformed or in an unexpected state. Please fix it manually to mark as quiz.`,
					);
					console.warn(
						`Could not set quiz key for "${file.path}". Frontmatter type was: ${typeof fm}`,
						fm,
					);
				}
				// Obsidian handles saving the changes to the file if 'fm' was mutated.
			});
		} catch (error) {
			new Notice(
				`Error processing frontmatter for "${file.basename}". See console.`,
			);
			console.error(
				`Failed to process frontmatter for ${file.path}:`,
				error,
			);
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

	/**
	 * Finds all notes with the quiz tag.
	 * @returns {Promise<TFile[]>}
	 */
	// In FsrsPlugin class

	async getQuizNotes(): Promise<TFile[]> {
		const allFiles = this.app.vault.getMarkdownFiles();
		const quizNotes: TFile[] = [];
		const quizKey = this.settings.quizFrontmatterKey || "quiz"; // Use the setting

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

	/**
	 * Parses a note's content for Question, Answer, and FSRS data.
	 * @param {string} content - The content of the note.
	 * @returns {{question: string, answer: string, fsrsData: object | null, existingContent: string}}
	 */
	// In FsrsPlugin class (main.ts)
	parseNoteContent(content: string) {
		let question = "";
		let answer = "";
		let fsrsData: any = null; // Can be single card object or Record<string, any>
		let contentForQaParsing = content;
		const identifiedClozes: {
			id: string;
			content: string;
			rawPlaceholder: string;
		}[] = [];

		// Regex to find {{id:content}} placeholders
		// Allows for identifiers without special characters, and content that isn't "}}"
		const clozeRegex = /\{\{([a-zA-Z0-9_-]+):((?:(?!\{\{|\}\}).)+)\}\}/g;

		// First, try to separate FSRS data block from the rest of the content
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
					fsrsData = JSON.parse(jsonString); // Keep as parsed
					contentForQaParsing = parts
						.slice(0, parts.length - 1)
						.join(FSRS_DATA_SEPARATOR);
				} catch (e) {
					console.error("Failed to parse FSRS JSON from note:", e);
					fsrsData = null; // Or {} if we prefer to always have an object
					contentForQaParsing = content; // Full content becomes Q/A if FSRS block is corrupt
				}
			} else {
				// Last segment is not FSRS block, so all content is for Q/A
				contentForQaParsing = content;
			}
		} else {
			// No FSRS separator found
			contentForQaParsing = content;
		}

		// Now, scan the contentForQaParsing for cloze deletions
		// This content is the note body *before* any FSRS JSON block
		let match;
		while ((match = clozeRegex.exec(contentForQaParsing)) !== null) {
			identifiedClozes.push({
				id: match[1], // The identifier
				content: match[2], // The content of the cloze
				rawPlaceholder: match[0], // The full {{id:content}} string
			});
		}

		// Parse main question and answer (if no clozes, or if clozes are alongside main Q/A)
		// If clozes are present, the main Q/A might be ignored by startQuizSession,
		// but we parse it for completeness or potential fallback.
		const qaParts = contentForQaParsing.split(QA_SEPARATOR);
		question = qaParts[0].trim();
		// If clozes are present, the "question" here is the entire note body (minus FSRS block),
		// which will serve as the template for cloze questions.
		// The "answer" here might be irrelevant if clozes are the primary content.
		if (qaParts.length > 1) {
			answer = qaParts.slice(1).join(QA_SEPARATOR).trim();
		}

		// If no fsrsData was found in a dedicated block, but clozes are identified,
		// initialize fsrsData as an empty map to hold them.
		// Otherwise, if clozes are found and fsrsData is a single object, it indicates a migration scenario.
		if (
			identifiedClozes.length > 0 &&
			(fsrsData === null ||
				!(
					typeof fsrsData === "object" &&
					!Array.isArray(fsrsData) &&
					Object.keys(fsrsData).length > 0 &&
					!fsrsData.hasOwnProperty("due")
				))
		) {
			// If clozes exist, and FSRS data is null or looks like a single card (heuristic: has 'due' property)
			// or is not an object that could be a map of cards.
			// This is a bit tricky: if fsrsData is a single card, startQuizSession will need to handle migrating it.
			// For now, if clozes are present and fsrsData is null, let's make it an empty object.
			if (fsrsData === null) {
				fsrsData = {};
			}
		}

		return {
			question, // Main question (full text if clozes are present)
			answer, // Main answer (might be ignored if clozes are primary)
			fsrsData, // Parsed from JSON block (could be single obj or map)
			existingContent: contentForQaParsing.trim(), // Note body before FSRS block
			identifiedClozes, // Array of found cloze objects
		};
	}

	/**
	 * Writes FSRS data back to the note.
	 * @param {TFile} noteFile - The note file.
	 * @param {string} originalContentWithoutFsrs - The original Q/A content.
	 * @param {object} fsrsData - The FSRS data object to save.
	 */
	// In FsrsPlugin class (main.ts)
	// In FsrsPlugin class (main.ts)
	async writeFsrsDataToNote(
		noteFile: TFile,
		originalFrontmatter: string,
		originalBodyWithoutFsrs: string,
		dataToWrite: Record<string, any> | Card | null, // Can be a map for clozes, or a single card for simple
	) {
		if (dataToWrite === null) {
			// Don't write if data is null
			console.warn("Attempted to write null FSRS data. Skipping.");
			return;
		}
		const fsrsJsonString = JSON.stringify(dataToWrite, null, 2);
		const newFsrsBlock = `\n\n---\n\`\`\`json\n${fsrsJsonString}\n\`\`\``;

		const newBodyContentWithFsrs =
			originalBodyWithoutFsrs.trim() + newFsrsBlock;
		let finalNoteContent: string;

		if (originalFrontmatter.length > 0) {
			if (originalFrontmatter.endsWith("\n")) {
				finalNoteContent = originalFrontmatter + newBodyContentWithFsrs;
			} else {
				finalNoteContent =
					originalFrontmatter + "\n" + newBodyContentWithFsrs;
			}
		} else {
			finalNoteContent = newBodyContentWithFsrs;
		}

		await this.app.vault.modify(noteFile, finalNoteContent);
	}

	// In FsrsPlugin class (main.ts)
	async startQuizSession() {
		const quizNotes = await this.getQuizNotes();
		if (quizNotes.length === 0) {
			new Notice(
				`No notes found with frontmatter key "${this.settings.quizFrontmatterKey}: true".`,
			);
			return;
		}

		const now = new Date();
		// console.log(`[FSRS Debug] Starting quiz session. Current time (now): ${now.toISOString()}`);

		const dueItems: QuizItem[] = [];
		const newItems: QuizItem[] = []; // We still populate this for logging or potential future "review ahead" features

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

			// console.log(`[FSRS Debug][${noteFile.basename}] Parsed fsrsData from note:`, JSON.stringify(fsrsData));
			// console.log(`[FSRS Debug][${noteFile.basename}] IdentifiedClozes count:`, identifiedClozes.length);

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
						console.warn(
							`[FSRS Info][${noteFile.basename}] Note has clozes, but FSRS data is a single card. Clozes will use new/existing map entries.`,
						);
					} else if (!looksLikeSingleCard || keys.length > 0) {
						fsrsDataMapForClozes = fsrsData as Record<string, Card>;
					}
				}
				// console.log(`[FSRS Debug][${noteFile.basename}] Determined fsrsDataMapForClozes:`, JSON.stringify(fsrsDataMapForClozes));

				for (const cloze of identifiedClozes) {
					const cardFromMap = fsrsDataMapForClozes[cloze.id];
					const card: Card =
						cardFromMap || (createEmptyCard(now) as Card);
					// const cardIsNew = !cardFromMap;
					// console.log(`[FSRS Debug][${noteFile.basename}] Cloze ID "${cloze.id}": Card from map was ${cardIsNew ? 'NOT found (new card created)' : 'found'}. Card state: due=${card.due}, stability=${card.stability}, reps=${card.reps}`);

					const dueDate =
						typeof card.due === "string"
							? new Date(card.due)
							: card.due;
					const isActuallyDue =
						dueDate instanceof Date &&
						!isNaN(dueDate.getTime()) &&
						dueDate <= now;
					// console.log(`[FSRS Debug][${noteFile.basename}] Cloze ID "${cloze.id}": Parsed due date: ${dueDate.toISOString()}, Is due? ${isActuallyDue}`);

					const quizItem: QuizItem = {
						file: noteFile,
						card,
						identifier: cloze.id,
						isCloze: true,
						noteBodyForCloze: existingContent,
						clozeDetails: cloze,
						fsrsDataStoreForNote: fsrsDataMapForClozes,
						mainQuestion: question,
						mainAnswer: answer,
					};
					if (isActuallyDue) {
						dueItems.push(quizItem);
					} else {
						newItems.push(quizItem);
					}
				}
			} else {
				let cardForSimpleNote: Card;
				if (
					fsrsData &&
					typeof fsrsData === "object" &&
					fsrsData.hasOwnProperty("due")
				) {
					cardForSimpleNote = fsrsData as Card;
				} else {
					cardForSimpleNote = createEmptyCard(now) as Card;
					if (
						fsrsData !== null &&
						(typeof fsrsData !== "object" ||
							Object.keys(fsrsData).length > 0)
					) {
						console.warn(
							`[FSRS Info][${noteFile.basename}] Simple Q/A FSRS data was not a single card or was unexpected. Treating as new/reset. Data:`,
							fsrsData,
						);
					}
				}
				const dueDate =
					typeof cardForSimpleNote.due === "string"
						? new Date(cardForSimpleNote.due)
						: cardForSimpleNote.due;
				const isActuallyDue =
					dueDate instanceof Date &&
					!isNaN(dueDate.getTime()) &&
					dueDate <= now;
				const quizItem: QuizItem = {
					file: noteFile,
					card: cardForSimpleNote,
					identifier: "_default",
					isCloze: false,
					mainQuestion: question,
					mainAnswer: answer,
					noteBodyForCloze: existingContent,
					fsrsDataStoreForNote: cardForSimpleNote,
				};
				if (isActuallyDue) {
					dueItems.push(quizItem);
				} else {
					newItems.push(quizItem);
				}
			}
		}

		// --- MODIFIED SELECTION LOGIC ---
		if (dueItems.length > 0) {
			const shuffleArray = (array: QuizItem[]) => {
				for (let i = array.length - 1; i > 0; i--) {
					const j = Math.floor(Math.random() * (i + 1));
					[array[i], array[j]] = [array[j], array[i]];
				}
			};
			shuffleArray(dueItems); // Shuffle only the due items

			const selectedItem = dueItems[0];
			// console.log(`[FSRS Debug] Selected item for quiz (from DUE items): ${selectedItem.file.basename} - ${selectedItem.identifier} (due: ${selectedItem.card.due})`);
			new QuizModal(this.app, this, selectedItem).open();
		} else {
			// No items are strictly due
			new Notice("Nothing is strictly due for review right now!");
			// console.log("[FSRS Debug] No strictly due items. Quiz session will not start.");
			// Optionally, you could inform about newItems.length if you want to allow "review ahead" later.
			// console.log(`[FSRS Debug] Items not currently due (new or future): ${newItems.length}`);
			return;
		}
		// --- END MODIFIED SELECTION LOGIC ---
	}
}
