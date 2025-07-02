import { App, Modal, Notice, TFile, moment, MarkdownRenderer } from "obsidian";
import type FsrsPlugin from "./main";
import type { Card, QuizItem } from "./main";

export enum Rating {
	Again = 1,
	Hard = 2,
	Good = 3,
	Easy = 4,
}

export class QuizModal extends Modal {
	plugin: FsrsPlugin;
	item: QuizItem;

	question: string;
	answer: string;

	isAnswerShown: boolean = false;
	boundHandleKeyPress: (event: KeyboardEvent) => void;
	boundShowAnswerOnClick: () => void;


	constructor(app: App, plugin: FsrsPlugin, item: QuizItem) {
		super(app);
		this.plugin = plugin;
		this.item = item;
		this.question = item.question;
		this.answer = item.answer;
	}

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
			// Regex for clozes that are NOT the active one.
			const clozeRegex = /\{\{([a-zA-Z0-9_-]+)::((?:.|\n)*?)\}\}/g;

			let lastIndex = 0;
			const fragment = document.createDocumentFragment();
			let matchFoundInTextNode = false;
			let match;

			while ((match = clozeRegex.exec(textContent)) !== null) {
				matchFoundInTextNode = true;
				const clozeId = match[1];
				// Do not render the active cloze's content as a capsule
				if (clozeId === this.item.id) {
					// Add the raw placeholder back as text
					fragment.appendChild(document.createTextNode(match[0]));
					lastIndex = clozeRegex.lastIndex;
					continue;
				}

				const contentToRender = match[2];

				if (match.index > lastIndex) {
					fragment.appendChild(
						document.createTextNode(
							textContent.substring(lastIndex, match.index),
						),
					);
				}

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
const timerContainer = contentEl.createDiv({ cls: "quiz-timer-container" });
timerContainer.createDiv({ cls: "quiz-timer-bar" });
		contentEl
			.createEl("h2", {
				text: `Quiz: ${this.item.file.basename}`,
			})
			.addClass("quiz-modal-title");

		// Prepare question text for display
		let questionToRender = this.question;
		if (this.item.isCloze) {
			const activeClozeRegex = new RegExp(
				`\\{\\{${this.item.id}::((?:.|\\n)*?)\\}\\}`,
			);
			questionToRender = this.question.replace(
				activeClozeRegex,
				" [...] ",
			);
		}

		const questionContainer = contentEl.createDiv({
			cls: "quiz-question-container",
		});
		const questionDiv = questionContainer.createEl("div", {
			cls: "quiz-question markdown-reading-view",
		});

		await MarkdownRenderer.render(
			this.app,
			questionToRender,
			questionDiv,
			this.item.file.path,
			this.plugin,
		);

		// Post-process to render non-active clozes as capsules
		if (this.item.isCloze) {
			this.transformClozesInElement(questionDiv);
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
				this.triggerDisplayAnswer();
			}
		} else {
			const keyMap: Record<string, number> = {
				[this.plugin.settings.ratingAgainKey.toLowerCase()]: 1,
				[this.plugin.settings.ratingHardKey.toLowerCase()]: 2,
				[this.plugin.settings.ratingGoodKey.toLowerCase()]: 3,
				[this.plugin.settings.ratingEasyKey.toLowerCase()]: 4,
			};
			const ratingValue = keyMap[event.key.toLowerCase()];
			if (ratingValue) {
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
		this.boundShowAnswerOnClick = this.triggerDisplayAnswer.bind(this);
		container.addEventListener("click", this.boundShowAnswerOnClick);
	}

	triggerDisplayAnswer() {
		if (this.isAnswerShown) return;

		this.isAnswerShown = true;
		this.displayAnswer();

		const container = this.contentEl.querySelector(
			".quiz-question-container",
		);
		if (container) {
			container.removeEventListener("click", this.boundShowAnswerOnClick);
			container.querySelector(".quiz-show-answer-hint")?.remove();
		}
		this.modalEl.focus();
	}

	displayAnswer() {
		const { contentEl } = this;
		const answerContainer = contentEl.createDiv({
			cls: "quiz-answer-container",
		});
		const answerDiv = answerContainer.createEl("div", {
			cls: "quiz-answer markdown-reading-view",
		});
		MarkdownRenderer.render(
			this.app,
			this.answer,
			answerDiv,
			this.item.file.path,
			this.plugin,
		);

		contentEl.createEl("hr");

		const ratingContainer = contentEl.createDiv({
			cls: "quiz-rating-container",
		});
		ratingContainer.style.display = "flex";
		ratingContainer.style.justifyContent = "space-around";

		const ratings = [
			{
				text: "Again",
				value: 1,
				key: this.plugin.settings.ratingAgainKey,
				color: "again",
			},
			{
				text: "Hard",
				value: 2,
				key: this.plugin.settings.ratingHardKey,
				color: "hard",
			},
			{
				text: "Good",
				value: 3,
				key: this.plugin.settings.ratingGoodKey,
				color: "good",
			},
			{
				text: "Easy",
				value: 4,
				key: this.plugin.settings.ratingEasyKey,
				color: "easy",
			},
		];

		ratings.forEach(({ text, value, key, color }) => {
			const button = ratingContainer.createEl("button", {
				text: `${text} (${key.toUpperCase()})`,
				cls: `quiz-rating-button quiz-rating-${color}`,
			});
			button.onclick = () => this.handleRatingByValue(value);
		});
	}

	onClose() {
		this.modalEl.removeEventListener("keydown", this.boundHandleKeyPress);
		const container = this.contentEl.querySelector(
			".quiz-question-container",
		);
		if (container) {
			container.removeEventListener("click", this.boundShowAnswerOnClick);
		}
		this.contentEl.empty();
	}

	async handleRatingByValue(ratingValue: number) {
		const localRatingEnum = this.mapIntToLocalRating(ratingValue);
		if (localRatingEnum === undefined) return;

		const now = new Date();
		const schedules = this.plugin.fsrsInstance.repeat(this.item.card, now);
		const updatedCard = schedules[localRatingEnum]?.card;

		if (updatedCard) {
			await this.plugin.updateCardDataInNote(
				this.item.file,
				this.item.id,
				updatedCard,
			);
			new Notice(
				`Rated - next review: ${moment(updatedCard.due).calendar()}`,
			);
		} else {
			new Notice("Error updating card schedule.", 5000);
			console.error("FSRS Error: Could not update card schedule.");
		}
		this.close();
		this.plugin.startQuizSession();
	}

	mapIntToLocalRating(ratingInt: number): Rating | undefined {
		if (Object.values(Rating).includes(ratingInt)) {
			return ratingInt as Rating;
		}
		return undefined;
	}
}
