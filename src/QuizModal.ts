import { App, Modal, Notice, TFile, moment, MarkdownRenderer } from "obsidian";
import type FsrsPlugin from "./main";
// Import the Card type and QuizItem interface from main.ts
// Ensure QuizItem is exported from main.ts
import type { Card, QuizItem } from "./main";

// This Rating enum is local to QuizModal and used for UI and mapping.
export enum Rating {
	Again = 1,
	Hard = 2,
	Good = 3,
	Easy = 4,
}

export class QuizModal extends Modal {
	plugin: FsrsPlugin;
	item: QuizItem; // Stores the comprehensive QuizItem passed from startQuizSession

	// These are now set in onOpen based on the item type
	question: string = "";
	answer: string = "";

	originalFrontmatterText: string = "";
	// originalBodyWithoutFsrs is the note content *before* the FSRS JSON block.
	// It's item.noteBodyForCloze for clozes, or parsed for simple notes.
	originalBodyWithoutFsrs: string = "";

	isAnswerShown: boolean = false;
	boundHandleKeyPress: (event: KeyboardEvent) => void;
	boundShowAnswerOnClick: () => void;

	constructor(app: App, plugin: FsrsPlugin, item: QuizItem) {
		super(app);
		this.plugin = plugin;
		this.item = item;

		// Initialize noteFile and currentCard from the item for compatibility
		// if other methods in your class (not shown/modified here) still expect them directly.
		// However, it's better to use this.item.file and this.item.card directly.
		// this.noteFile = item.file;
		// this.currentCard = item.card;
	}

	// In QuizModal class (src/QuizModal.ts)
	private transformClozesInElement(element: HTMLElement) {
		const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
		let node;
		const nodesToReplaceDetails: {
			originalNode: Node;
			replacementFragment: DocumentFragment;
		}[] = [];

		while ((node = walker.nextNode())) {
			if (node.nodeValue === null) continue;

			const textContent = node.nodeValue;
			// This regex should only match clozes that are NOT the active " [...] " placeholder
			const clozeRegex =
				/\{\{([a-zA-Z0-9_-]+):((?:(?!\{\{|\}\}).)+)\}\}/g;

			let lastIndex = 0;
			const fragment = document.createDocumentFragment();
			let matchFoundInTextNode = false;
			let match;

			while ((match = clozeRegex.exec(textContent)) !== null) {
				matchFoundInTextNode = true;
				const contentToRender = match[2]; // e.g., "thing"

				// Add text before the match
				if (match.index > lastIndex) {
					fragment.appendChild(
						document.createTextNode(
							textContent.substring(lastIndex, match.index),
						),
					);
				}

				// Create the capsule HTML structure
				// All this is kind of repeated from main.ts
				const capsule = document.createElement("span");
				capsule.addClass("fsrs-cloze-capsule");

				const iconPart = capsule.createSpan({
					cls: "fsrs-cloze-icon-part",
				});
				iconPart.setText("?");

				const textPart = capsule.createSpan({
					cls: "fsrs-cloze-text-part",
				});
				textPart.setText(contentToRender);

				fragment.appendChild(capsule);

				lastIndex = clozeRegex.lastIndex;
			}

			if (matchFoundInTextNode) {
				if (lastIndex < textContent.length) {
					fragment.appendChild(
						document.createTextNode(
							textContent.substring(lastIndex),
						),
					);
				}
				nodesToReplaceDetails.push({
					originalNode: node,
					replacementFragment: fragment,
				});
			}
		}

		for (const detail of nodesToReplaceDetails) {
			detail.originalNode.parentNode?.replaceChild(
				detail.replacementFragment,
				detail.originalNode,
			);
		}
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("quiz-modal-content");

		const titleEl = contentEl.createEl("h2", {
			text: `Quiz: ${this.item.file.basename}`,
		});
		titleEl.addClass("quiz-modal-title");

		const rawFileContent = await this.app.vault.read(this.item.file);
		this.originalFrontmatterText = "";
		let bodyContentForNoteStructure = rawFileContent;

		const fileCache = this.app.metadataCache.getFileCache(this.item.file);
		const yamlEndOffset = fileCache?.frontmatterPosition?.end?.offset;

		if (
			yamlEndOffset &&
			yamlEndOffset > 0 &&
			yamlEndOffset <= rawFileContent.length
		) {
			this.originalFrontmatterText = rawFileContent.substring(
				0,
				yamlEndOffset,
			);
			bodyContentForNoteStructure =
				rawFileContent.substring(yamlEndOffset);
		}
		bodyContentForNoteStructure = bodyContentForNoteStructure.trimStart();

		const parsedBodyForReconstruction = this.plugin.parseNoteContent(
			bodyContentForNoteStructure,
		);
		this.originalBodyWithoutFsrs =
			parsedBodyForReconstruction.existingContent;

		// Step 1: Prepare the question string - active cloze is " [...] ", others are raw
		if (
			this.item.isCloze &&
			this.item.clozeDetails &&
			this.item.noteBodyForCloze !== undefined
		) {
			const activeClozePlaceholderText = " [...] ";
			// item.noteBodyForCloze is the full body text (sans frontmatter, sans FSRS block)
			// It contains all raw cloze placeholders {{q1:text1}}, {{q2:text2}}, etc.
			this.question = this.item.noteBodyForCloze.replace(
				this.item.clozeDetails.rawPlaceholder, // e.g., "{{q1:text1}}"
				activeClozePlaceholderText,
			);
			this.answer = this.item.clozeDetails.content;
		} else if (
			!this.item.isCloze &&
			this.item.mainQuestion !== undefined &&
			this.item.mainAnswer !== undefined
		) {
			this.question = this.item.mainQuestion;
			this.answer = this.item.mainAnswer;
		} else {
			/* ... error handling ... */ return;
		}

		if (
			(!this.question && this.item.isCloze) ||
			(!this.question && !this.item.isCloze && !this.answer)
		) {
			contentEl.createEl("p", {
				text: "Error: Question or answer is missing.",
			});
			return;
		}

		const questionContainer = contentEl.createDiv({
			cls: "quiz-question-container",
		});
		const questionDiv = questionContainer.createEl("div", {
			cls: "quiz-question",
		});

		// Step 2: Render the markdown (non-active clozes are still raw text like {{q2:banana}})
		MarkdownRenderer.render(
			this.app,
			this.question,
			questionDiv,
			this.item.file.path,
			this.plugin,
		);

		// Step 3: Manually process the rendered questionDiv to transform raw clozes into capsules
		if (this.item.isCloze) {
			// Only do this if it was a cloze question to begin with
			this.transformClozesInElement(questionDiv);
		}

		this.isAnswerShown = false;
		this.setupShowAnswerInteraction(questionContainer);
		// ... rest of onOpen (key listeners, focus)
		this.boundHandleKeyPress = this.handleKeyPress.bind(this);
		this.modalEl.addEventListener("keydown", this.boundHandleKeyPress);
		this.modalEl.tabIndex = -1;
		this.modalEl.focus();
	}

	handleKeyPress(event: KeyboardEvent) {
		if (!this.isAnswerShown) {
			if (event.key === " ") {
				event.preventDefault();
				this.triggerDisplayAnswer();
			}
		} else {
			let ratingValue = 0;
			const pressedKey = event.key.toLowerCase();
			const settings = this.plugin.settings;

			if (pressedKey === (settings.ratingAgainKey || "a").toLowerCase())
				ratingValue = 1;
			else if (
				pressedKey === (settings.ratingHardKey || "r").toLowerCase()
			)
				ratingValue = 2;
			else if (
				pressedKey === (settings.ratingGoodKey || "s").toLowerCase()
			)
				ratingValue = 3;
			else if (
				pressedKey === (settings.ratingEasyKey || "t").toLowerCase()
			)
				ratingValue = 4;

			if (ratingValue > 0) {
				event.preventDefault();
				this.handleRatingByValue(ratingValue);
			}
		}
	}

	setupShowAnswerInteraction(container: HTMLElement) {
		const hintText = container.createEl("p", {
			text: "(Click or press Space to show answer)",
			cls: "quiz-show-answer-hint",
		});
		hintText.style.textAlign = "center";
		hintText.style.fontStyle = "italic";
		hintText.style.marginTop = "10px";
		this.boundShowAnswerOnClick = this.triggerDisplayAnswer.bind(this);
		container.addEventListener("click", this.boundShowAnswerOnClick);
	}

	triggerDisplayAnswer() {
		if (!this.isAnswerShown) {
			this.displayAnswer();
			this.isAnswerShown = true;
			const container = this.contentEl.querySelector(
				".quiz-question-container",
			);
			if (container) {
				container.removeEventListener(
					"click",
					this.boundShowAnswerOnClick,
				);
				const hint = container.querySelector(".quiz-show-answer-hint");
				hint?.remove();
			}
			this.modalEl.focus();
		}
	}

	displayAnswer() {
		const { contentEl } = this;
		if (!this.answer) {
			contentEl.createEl("p", { text: "No answer found for this item." });
		} else {
			const answerContainer = contentEl.createDiv({
				cls: "quiz-answer-container",
			});
			const answerDiv = answerContainer.createEl("div", {
				cls: "quiz-answer",
			});
			MarkdownRenderer.render(
				this.app,
				this.answer,
				answerDiv,
				this.item.file.path,
				this.plugin,
			);
		}
		contentEl.createEl("hr");

		const ratingContainer = contentEl.createDiv({
			cls: "quiz-rating-container",
		});
		ratingContainer.style.display = "flex";
		ratingContainer.style.justifyContent = "space-around";
		ratingContainer.style.gap = "10px";

		const ratings = [
			{
				text: "Again",
				value: 1,
				keySetting: this.plugin.settings.ratingAgainKey,
				defaultKey: "a",
				colorClass: "again",
			},
			{
				text: "Hard",
				value: 2,
				keySetting: this.plugin.settings.ratingHardKey,
				defaultKey: "r",
				colorClass: "hard",
			},
			{
				text: "Good",
				value: 3,
				keySetting: this.plugin.settings.ratingGoodKey,
				defaultKey: "s",
				colorClass: "good",
			},
			{
				text: "Easy",
				value: 4,
				keySetting: this.plugin.settings.ratingEasyKey,
				defaultKey: "t",
				colorClass: "easy",
			},
		];
		ratings.forEach((r) => {
			const keyDisplay = (r.keySetting || r.defaultKey).toUpperCase();
			const button = ratingContainer.createEl("button", {
				text: `${r.text} (${keyDisplay})`,
				cls: `quiz-rating-button quiz-rating-${r.colorClass}`,
			});
			button.onclick = async () => {
				await this.handleRatingByValue(r.value);
			};
		});
	}

	// Removed the old handleRating(fsrsRating: Rating) as handleRatingByValue is now primary.

	onClose() {
		const { contentEl } = this;
		this.modalEl.removeEventListener("keydown", this.boundHandleKeyPress);
		const container = contentEl.querySelector(".quiz-question-container");
		if (container && this.boundShowAnswerOnClick) {
			container.removeEventListener("click", this.boundShowAnswerOnClick);
		}
		contentEl.empty();
	}

	async handleRatingByValue(ratingValue: number) {
		const localRatingEnum = this.mapIntToLocalRating(ratingValue); // Changed to mapIntToLocalRating
		if (localRatingEnum === undefined) {
			new Notice("Invalid rating key pressed.", 3000);
			return;
		}

		const now = new Date();
		// this.item.card is the specific card (for cloze or simple Q/A) being reviewed
		const schedules = this.plugin.fsrsInstance.repeat(this.item.card, now);

		// The FSRS library's repeat method returns schedules keyed by its own Rating enum.
		// We need to map our local Rating (Again, Hard, etc.) to the FSRS library's expected keys.
		// For simplicity, if your local Rating enum values (1,2,3,4) directly correspond
		// to the FSRS library's Rating enum values used as keys in 'schedules', this direct access works.
		// If not, a mapping is needed. Example: schedules[FSRSRating.Again]
		// Assuming localRatingEnum values match FSRS schedule keys for now:
		const updatedCard = schedules[localRatingEnum]?.card;

		if (updatedCard) {
			let dataToWrite: Record<string, Card> | Card;

			if (this.item.isCloze) {
				// Ensure fsrsDataStoreForNote is treated as a map for clozes
				let fsrsMap: Record<string, Card>;
				if (
					this.item.fsrsDataStoreForNote &&
					typeof this.item.fsrsDataStoreForNote === "object" &&
					!this.item.fsrsDataStoreForNote.hasOwnProperty("due")
				) {
					// It's likely already a map (or should be)
					fsrsMap = this.item.fsrsDataStoreForNote as Record<
						string,
						Card
					>;
				} else {
					// If fsrsDataStoreForNote was null, or a single card (unexpected for clozes here), initialize a new map.
					// This path might indicate an issue in how fsrsDataStoreForNote was populated in startQuizSession for clozes.
					fsrsMap = {};
					if (this.item.fsrsDataStoreForNote) {
						// Log if it was unexpectedly a single card
						console.warn(
							"QuizModal: fsrsDataStoreForNote for a cloze item was a single card. Creating new map.",
						);
					}
				}
				fsrsMap[this.item.identifier] = updatedCard; // identifier is the clozeId
				dataToWrite = fsrsMap;
			} else {
				// For simple notes, dataToWrite is just the updated single card.
				dataToWrite = updatedCard;
			}

			await this.plugin.writeFsrsDataToNote(
				this.item.file,
				this.originalFrontmatterText,
				this.originalBodyWithoutFsrs,
				dataToWrite,
			);
			new Notice(
				`Rated "${this.item.file.basename}" (${Rating[localRatingEnum]}) - next review: ${moment(updatedCard.due).calendar()}`,
			);
		} else {
			new Notice("Error updating card schedule.", 5000);
			console.error(
				"FSRS Error: Could not get schedule for rating. Card:",
				this.item.card,
				"Schedules:",
				schedules,
			);
		}
		this.close();
		this.plugin.startQuizSession();
	}

	mapIntToLocalRating(ratingInt: number): Rating | undefined {
		// Renamed to mapIntToLocalRating
		switch (ratingInt) {
			case 1:
				return Rating.Again;
			case 2:
				return Rating.Hard;
			case 3:
				return Rating.Good;
			case 4:
				return Rating.Easy;
			default:
				console.warn("Invalid rating integer:", ratingInt);
				return undefined;
		}
	}
}
