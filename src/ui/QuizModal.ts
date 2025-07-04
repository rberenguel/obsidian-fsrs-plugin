import {
	App,
	Modal,
	Notice,
	TFile,
	moment,
	MarkdownRenderer,
	setIcon,
} from "obsidian";
import type FsrsPlugin from "../main";
import type { Card, QuizItem } from "../types";
import { State } from "../libs/fsrs";

export enum Rating {
	Again = 1,
	Hard = 2,
	Good = 3,
	Easy = 4,
}

export class QuizModal extends Modal {
	plugin: FsrsPlugin;
	queue: QuizItem[];
	currentItem: QuizItem;
	totalInSession: number;

	question: string;
	answer: string;

	isAnswerShown: boolean = false;
	boundHandleKeyPress: (event: KeyboardEvent) => void;
	boundShowAnswerOnClick: () => void;

	constructor(
		app: App,
		plugin: FsrsPlugin,
		queue: QuizItem[],
		totalInSession: number,
	) {
		super(app);
		this.plugin = plugin;
		this.queue = queue;
		this.currentItem = queue[0];
		this.totalInSession = totalInSession;

		// Note: The rest of the original constructor logic that sets this.question, this.answer etc.
		// should be moved here and use this.currentItem instead of this.item.
		this.question = this.currentItem.question;
		this.answer = this.currentItem.answer;
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
				if (clozeId === this.currentItem.id) {
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
	async navigateToSource() {
		this.close(); // Close the modal before navigating

		const file = this.currentItem.file;
		// The 'id' for a Q&A card is its block reference
		const blockId = this.currentItem.id;

		// Construct the link text and open it
		const linktext = `${file.path}#^${blockId}`;
		await this.app.workspace.openLinkText(linktext, file.path, false);
	}
	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("quiz-modal-content");
		const headerContainer = contentEl.createDiv({
			cls: "quiz-header-container",
		});
		const leftContainer = headerContainer.createDiv({
			cls: "quiz-header-left",
		});
		// Timer bar
		const timerContainer = headerContainer.createDiv({
			cls: "quiz-timer-container",
		});
		timerContainer.createDiv({ cls: "quiz-timer-bar" });
		if (!this.currentItem.isCloze) {
			const linkEl = leftContainer.createEl("a", {
				cls: "quiz-link-icon",
			});
			linkEl.setAttribute("aria-label", "Go to source");
			setIcon(linkEl, "link");
			linkEl.onclick = () => {
				this.navigateToSource();
			};
		}
		// Counter text
		const counterEl = headerContainer.createDiv({ cls: "quiz-counter" });
		const currentCardNumber = this.totalInSession - this.queue.length + 1;
		counterEl.setText(`${currentCardNumber} / ${this.totalInSession}`);
		// Prepare question text for display
		let questionToRender = this.question;
		if (this.currentItem.isCloze) {
			const activeClozeRegex = new RegExp(
				`\\{\\{${this.currentItem.id}::((?:.|\\n)*?)\\}\\}`,
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
			this.currentItem.file.path,
			this.plugin,
		);

		// Post-process to render non-active clozes as capsules
		if (this.currentItem.isCloze) {
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
			this.currentItem.file.path,
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
		const wasNew = this.currentItem.card.state === State.New;
		const localRatingEnum = this.mapIntToLocalRating(ratingValue);
		if (localRatingEnum === undefined) return;

		const now = new Date();
		const schedules = this.plugin.fsrsInstance.repeat(
			this.currentItem.card,
			now,
		);
		const updatedCard = schedules[localRatingEnum]?.card;

		if (updatedCard) {
			await this.plugin.updateCardDataInNote(
				this.currentItem.file,
				this.currentItem.id,
				updatedCard,
			);
			// If the card was new, increment the daily counter
			if (wasNew) {
				await this.plugin.incrementNewCardCount();
			}
			new Notice(
				`Rated - next review: ${moment(updatedCard.due).calendar()}`,
			);
		} else {
			new Notice("Error updating card schedule.", 5000);
			console.error("FSRS Error: Could not update card schedule.");
		}

		this.close();

		const nextQueue = this.queue.slice(1);

		await this.plugin.updateUIDisplays(nextQueue.length);

		if (nextQueue.length > 0) {
			new QuizModal(
				this.app,
				this.plugin,
				nextQueue,
				this.totalInSession,
			).open();
		} else {
			new Notice("Quiz session complete!");
		}
	}

	mapIntToLocalRating(ratingInt: number): Rating | undefined {
		if (Object.values(Rating).includes(ratingInt)) {
			return ratingInt as Rating;
		}
		return undefined;
	}
}
