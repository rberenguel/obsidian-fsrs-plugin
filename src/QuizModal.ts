import { App, Modal, Notice, TFile, moment, MarkdownRenderer } from 'obsidian';

import type FsrsPlugin from './main'; 

interface Card {
    due: Date; // Or Date | string if it can be converted. The FSRS functions should clarify this.
    stability: number;
    difficulty: number;
    elapsed_days: number;
    scheduled_days: number;
    reps: number;
    lapses: number;
    state: 'new' | 'learning' | 'review' | 'relearning'; // Confirm these states with your FSRS library

}

export enum Rating {
    Again = 1,
    Hard = 2,
    Good = 3,
    Easy = 4,
}

export class QuizModal extends Modal {
	plugin: FsrsPlugin;
	noteFile: TFile;
	currentCard: Card;
	question = "";
	answer = "";
	originalContentWithoutFsrs = ""; // To preserve Q/A part when rewriting
	isAnswerShown: boolean = false;
	boundHandleKeyPress: (event: KeyboardEvent) => void;
	boundShowAnswerOnClick: () => void; // To store the bound click handler
	originalFrontmatterText = "";

	// Rename originalContentWithoutFsrs for clarity to indicate it's body content
	originalBodyWithoutFsrs = "";
	constructor(app: App, plugin: FsrsPlugin, noteFile: TFile, card: Card) {
		super(app);
		this.plugin = plugin;
		this.noteFile = noteFile;
		this.currentCard = card;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("quiz-modal-content");

		const titleEl = contentEl.createEl("h2", {
			text: `Quiz: ${this.noteFile.basename}`,
		});
		titleEl.addClass("quiz-modal-title");

		const rawFileContent = await this.app.vault.read(this.noteFile);
		let bodyContentForParsing = rawFileContent;
		this.originalFrontmatterText = ""; // Reset

		const fileCache = this.app.metadataCache.getFileCache(this.noteFile);
		// Use frontmatterPosition for a more direct way to get the end of YAML
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
			bodyContentForParsing = rawFileContent.substring(yamlEndOffset);
		}
		// The bodyContentForParsing might start with newlines if there was space after frontmatter.
		// Trimming it ensures clean parsing for Q/A.
		bodyContentForParsing = bodyContentForParsing.trimStart();

		// Now, parse only the (potentially trimmed) bodyContentForParsing for Q/A and FSRS data
		// The parseNoteContent method itself doesn't need to change for this specific issue,
		// as it operates on the string it's given.
		const parsedBody = this.plugin.parseNoteContent(bodyContentForParsing); //
		this.question = parsedBody.question;
		this.answer = parsedBody.answer;

		// This 'existingContent' from parseNoteContent is derived from bodyContentForParsing,
		// so it represents the body content before the FSRS JSON block.
		this.originalBodyWithoutFsrs = parsedBody.existingContent;

		if (!this.question && !this.answer) {
			// Or a more robust check if parsing failed
			contentEl.createEl("p", {
				text: "Error: Could not parse question/answer from note body.",
			});
			return;
		}
		if (!this.question) {
			// If only question is missing but answer might be there (or vice-versa)
			contentEl.createEl("p", {
				text: "Error: Could not parse question from note body.",
			});
			// Potentially allow proceeding if answer exists, or return
		}

		const questionContainer = contentEl.createDiv({
			cls: "quiz-question-container",
		});
		const questionDiv = questionContainer.createEl("div", {
			cls: "quiz-question",
		});
		if (this.question) {
			MarkdownRenderer.render(
				// Or MarkdownRenderer.renderMarkdown
				this.app,
				this.question,
				questionDiv,
				this.noteFile.path, // Source path for context (e.g., for relative links if any)
				this.plugin, // Component (the plugin instance) for lifecycle management
			);
		} else {
			questionDiv.setText("Question not found.");
		}

		this.isAnswerShown = false;
		this.setupShowAnswerInteraction(questionContainer);

		this.boundHandleKeyPress = this.handleKeyPress.bind(this);
		this.modalEl.addEventListener("keydown", this.boundHandleKeyPress);
		this.modalEl.tabIndex = -1;
		this.modalEl.focus();
	}

	handleKeyPress(event: KeyboardEvent) {
		if (!this.isAnswerShown) {
			if (event.key === " ") {
				event.preventDefault();
				this.triggerDisplayAnswer(); // Call the same function as click
			}
		} else {
			let ratingValue = 0;
			const pressedKey = event.key.toLowerCase();

			// Read configured hotkeys from settings, with fallbacks to defaults
			const againKey = (
				this.plugin.settings.ratingAgainKey || "a"
			).toLowerCase();
			const hardKey = (
				this.plugin.settings.ratingHardKey || "r"
			).toLowerCase();
			const goodKey = (
				this.plugin.settings.ratingGoodKey || "s"
			).toLowerCase();
			const easyKey = (
				this.plugin.settings.ratingEasyKey || "t"
			).toLowerCase();

			if (pressedKey === againKey) {
				ratingValue = 1;
			} else if (pressedKey === hardKey) {
				ratingValue = 2;
			} else if (pressedKey === goodKey) {
				ratingValue = 3;
			} else if (pressedKey === easyKey) {
				ratingValue = 4;
			}

			if (ratingValue > 0) {
				event.preventDefault();
				this.handleRatingByValue(ratingValue);
			}
		}
	}

	setupShowAnswerInteraction(container: HTMLElement) {
		// Create a visual hint if you like, or just make the question container clickable
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
			this.displayAnswer(); // This function will now also remove the hint/click listener for showing answer
			this.isAnswerShown = true;
			// Remove the click listener for showing answer to prevent re-triggering
			// and remove the hint
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
			this.modalEl.focus(); // Ensure modal keeps focus for rating keys
		}
	}
	displayAnswer() {
		const { contentEl } = this;

		// Assuming the hint/click interaction for showing answer is already handled
		// and elements like '.quiz-show-answer-hint' are removed by triggerDisplayAnswer()

		if (!this.answer) {
			contentEl.createEl("p", { text: "No answer found in this note." });
		} else {
			// Create a container for the answer, similar to the question's container
			const answerContainer = contentEl.createDiv({
				cls: "quiz-answer-container", // New container for the answer
			});

			const answerDiv = answerContainer.createEl("div", {
				// The actual div for answer content
				cls: "quiz-answer",
			});

			MarkdownRenderer.render(
				this.app,
				this.answer,
				answerDiv,
				this.noteFile.path,
				this.plugin,
			);
		}
		contentEl.createEl("hr"); // Separator before rating buttons

		const ratingContainer = contentEl.createDiv({
			cls: "quiz-rating-container",
		});
		ratingContainer.style.display = "flex"; // Use flexbox for easy spacing
		ratingContainer.style.justifyContent = "space-around"; // Or 'flex-start' with gap
		ratingContainer.style.gap = "10px"; // Spacing between buttons

		const ratings = [
    {
        text: "Again", value: 1, rating: Rating.Again, // Rating is your local enum
        // Get key from settings for display, fallback to default
        keyDisplay: (this.plugin.settings.ratingAgainKey || 'a').toUpperCase(),
        colorClass: "again"
    },
    {
        text: "Hard", value: 2, rating: Rating.Hard,
        keyDisplay: (this.plugin.settings.ratingHardKey || 'r').toUpperCase(),
        colorClass: "hard"
    },
    {
        text: "Good", value: 3, rating: Rating.Good,
        keyDisplay: (this.plugin.settings.ratingGoodKey || 's').toUpperCase(),
        colorClass: "good"
    },
    {
        text: "Easy", value: 4, rating: Rating.Easy,
        keyDisplay: (this.plugin.settings.ratingEasyKey || 't').toUpperCase(),
        colorClass: "easy"
    },
];


		ratings.forEach((r) => {
			const button = ratingContainer.createEl("button", {
				text: `${r.text} (${r.keyDisplay.toUpperCase()})`, // Show key hint
				cls: `quiz-rating-button quiz-rating-${r.colorClass}`,
			});
			button.onclick = async () => {
				await this.handleRatingByValue(r.value);
			};
		});
	}
	async handleRating(fsrsRating: Rating) {
		const now = new Date();
		const schedules = this.plugin.fsrsInstance.repeat(this.currentCard, now);

		const updatedCard = schedules[fsrsRating]?.card;

		if (updatedCard) {
			await this.plugin.writeFsrsDataToNote(
				this.noteFile,
				this.originalFrontmatterText,
				this.originalBodyWithoutFsrs,
				updatedCard,
			);
			new Notice(
				`Rated "${this.noteFile.basename}" - next review: ${moment(updatedCard.due).calendar()}`,
			);
		} else {
			new Notice("Error updating card schedule.", 5000);
			console.error(
				"FSRS Error: Could not get schedule for rating. Card:",
				this.currentCard,
				"Schedules:",
				schedules,
			);
		}
		this.close();
		// Optionally, trigger the next review item
		this.plugin.startQuizSession();
	}

	onClose() {
		const { contentEl } = this;
		// Remove general keydown listener
		this.modalEl.removeEventListener("keydown", this.boundHandleKeyPress);

		// Attempt to remove click listener if it might still be attached
		const container = contentEl.querySelector(".quiz-question-container");
		if (container && this.boundShowAnswerOnClick) {
			container.removeEventListener("click", this.boundShowAnswerOnClick);
		}
		contentEl.empty();
	}

	// New/Adapted method in QuizModal to handle rating by numeric value (1-4)
	async handleRatingByValue(ratingValue: number) {
		const fsrsRatingEnum = this.mapIntToRating(ratingValue);
		if (fsrsRatingEnum === undefined) {
			new Notice("Invalid rating key pressed.", 3000); // Add this
            return;
		}

		const now = new Date();
		const schedules = this.plugin.fsrsInstance.repeat(this.currentCard, now);
		const updatedCard = schedules[fsrsRatingEnum]?.card;

		if (updatedCard) {
			await this.plugin.writeFsrsDataToNote(
				this.noteFile,
				this.originalFrontmatterText, // Pass the stored frontmatter
				this.originalBodyWithoutFsrs, // Pass the stored body (before FSRS block)
				updatedCard,
			);
			new Notice(
				`Rated "${this.noteFile.basename}" (${(Rating as any)[fsrsRatingEnum]}) - next review: ${moment(updatedCard.due).calendar()}`,
			);
		} else {
			new Notice("Error updating card schedule.", 5000);
            console.error(
        "FSRS Error: Could not get schedule for rating. Card:",
        this.currentCard,
        "Schedules:",
        schedules 
    );
		}
		this.close();
		this.plugin.startQuizSession();
	}
	mapIntToRating(ratingInt: number): Rating | undefined {
		// Return the FSRS Rating enum type
		// Make sure 'Rating' here is the actual imported Rating enum from your FSRS library
		// e.g. import { Rating } from './fsrs-library';
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
				return undefined; // Or a default like Rating.Good, but undefined is clearer for errors
		}
	}
}
