import {
    App,
    Notice,
    Plugin,
    TFile,
    moment,
} from "obsidian";
import { fsrs, createEmptyCard, FSRS } from "./fsrs"; 

import { QuizModal } from './QuizModal';
import { FsrsSettingTab } from './FsrsSettingsTab';
import { FsrsPluginSettings, DEFAULT_SETTINGS } from './settings';

const FSRS_DATA_SEPARATOR = "\n---\n";
const QA_SEPARATOR = "\n---\n";

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
		// 'content' is expected to be the note body (after frontmatter), possibly trimmed at the start
		let question = "";
		let answer = "";
		let fsrsData = null;
		let contentForQaParsing = content; // This will be the string from which Q & A are extracted.
		// It's the original body, potentially excluding a valid FSRS block found at its end.

		// Attempt to find and parse an FSRS JSON block at the very end of the 'content'
		const parts = content.split(FSRS_DATA_SEPARATOR); // FSRS_DATA_SEPARATOR is "\n---\n"

		if (parts.length > 1) {
			// There's at least one '---' separator. Check the last segment.
			const lastSegment = parts[parts.length - 1].trim(); // Content of the segment after the last '---'

			if (
				lastSegment.startsWith("```json") &&
				lastSegment.endsWith("```")
			) {
				// The last segment is a valid FSRS JSON code block.
				try {
					const jsonString = lastSegment
						.substring(7, lastSegment.length - 3)
						.trim();
					fsrsData = JSON.parse(jsonString);
					// If FSRS data is found and parsed, then the content for Q/A parsing
					// is everything *before* this last FSRS block and its preceding '---'.
					contentForQaParsing = parts
						.slice(0, parts.length - 1)
						.join(FSRS_DATA_SEPARATOR);
				} catch (e) {
					console.error("Failed to parse FSRS JSON from note:", e);
					// If JSON parsing fails, treat the block as non-FSRS content.
					// Thus, the full 'content' is used for Q/A parsing (as if no valid FSRS block was at the end).
					contentForQaParsing = content;
				}
			} else {
				// The last segment (after the last '---') is NOT an FSRS JSON block.
				// Therefore, the full 'content' is considered for Q/A parsing.
				contentForQaParsing = content;
			}
		} else {
			// No '---' separator found in the 'content' at all.
			// So, the full 'content' is for Q/A parsing, and no FSRS block is present.
			contentForQaParsing = content;
		}

		// Now, parse question and answer from 'contentForQaParsing'
		const qaParts = contentForQaParsing.split(QA_SEPARATOR); // QA_SEPARATOR is "\n---\n"
		question = qaParts[0].trim();
		if (qaParts.length > 1) {
			answer = qaParts.slice(1).join(QA_SEPARATOR).trim();
		}

		return {
			question,
			answer,
			fsrsData, // This is the parsed FSRS data (object or null)
			existingContent: contentForQaParsing.trim(), // This becomes 'originalBodyWithoutFsrs'
			// It's the body content, *excluding* the FSRS JSON block if one was successfully parsed.
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
		fsrsData: object,
	) {
		const fsrsJsonString = JSON.stringify(fsrsData, null, 2);
		const newFsrsBlock = `\n\n---\n\`\`\`json\n${fsrsJsonString}\n\`\`\``;

		const newBodyContentWithFsrs =
			originalBodyWithoutFsrs.trim() + newFsrsBlock;

		let finalNoteContent: string;

		if (originalFrontmatter.length > 0) {
			// Check if the original frontmatter already ends with a newline.
			// The yamlEndOffset usually places it after the newline following '---'.
			if (originalFrontmatter.endsWith("\n")) {
				finalNoteContent = originalFrontmatter + newBodyContentWithFsrs;
			} else {
				// If originalFrontmatter doesn't end with a newline (unusual but possible if offset is different),
				// explicitly add one.
				finalNoteContent =
					originalFrontmatter + "\n" + newBodyContentWithFsrs;
			}
		} else {
			// No original frontmatter, so the note is just the new body with FSRS data.
			finalNoteContent = newBodyContentWithFsrs;
		}

		await this.app.vault.modify(noteFile, finalNoteContent);
	}
	async startQuizSession() {
		const quizNotes = await this.getQuizNotes();
		if (quizNotes.length === 0) {
			new Notice(
				`No notes found with frontmatter key "${this.settings.quizFrontmatterKey}: true".`,
			);
			return;
		}

		const now = new Date();
		let dueItems = [];
		let newItems = [];

		for (const noteFile of quizNotes) {
			const content = await this.app.vault.read(noteFile);
			const { fsrsData } = this.parseNoteContent(content);

			if (!fsrsData || !fsrsData.due) {
				// New card or malformed
				newItems.push({ file: noteFile, card: createEmptyCard(now) });
			} else {
				const card = fsrsData; // Assuming fsrsData is the card object
				// Ensure card.due is a Date object for comparison
				const dueDate: Date =
					typeof card.due === "string"
						? new Date(card.due)
						: card.due;
				if (
					dueDate instanceof Date &&
					!isNaN(dueDate.getTime()) &&
					dueDate <= now
				) {
					dueItems.push({ file: noteFile, card });
				} else if (!(dueDate instanceof Date) || isNaN(dueDate.getTime())) {
					console.warn(
						`Invalid due date for item ${noteFile.path}:`,
						card.due,
						"- treating as new.",
					);
					newItems.push({
						file: noteFile,
						card: createEmptyCard(now),
					});
				}
			}
		}

		let selectedItem = null;
		// Prioritize due items, then new items. Could add more sophisticated selection.
		if (dueItems.length > 0) {
			// Simple random selection for now
			selectedItem =
				dueItems[Math.floor(Math.random() * dueItems.length)];
		} else if (newItems.length > 0) {
			selectedItem =
				newItems[Math.floor(Math.random() * newItems.length)];
		}

		if (!selectedItem) {
			new Notice(
				"Nothing to review right now! All items are up-to-date.",
			);
			return;
		}

		new QuizModal(
			this.app,
			this,
			selectedItem.file,
			selectedItem.card,
		).open();
	}
};
