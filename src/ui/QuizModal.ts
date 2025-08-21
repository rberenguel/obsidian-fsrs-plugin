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
import type { Card, PluginContext, QuizItem } from "../types";
import { fsrs, State } from "../libs/fsrs";
import { incrementNewCardCount } from "src/logic/state";
import { ReplyModal } from "./ReplyModal";

async function hash(text: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(text);
	const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export enum Rating {
	Again = 1,
	Hard = 2,
	Good = 3,
	Easy = 4,
}

export class QuizModal extends Modal {
	context: PluginContext;
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
		context: PluginContext,
		plugin: FsrsPlugin,
		queue: QuizItem[],
		totalInSession: number,
	) {
		super(app);
		this.context = context;
		this.plugin = plugin;
		this.queue = queue;
		this.currentItem = queue[0];
		this.totalInSession = totalInSession;

		this.question = this.currentItem.question;
		this.answer = this.currentItem.answer;
	}

	async navigateToSource() {
		this.close();
		const file = this.currentItem.file;
		const blockId = this.currentItem.blockId;
		if (!blockId) return;

		const linktext = `${file.path}#^${blockId}`;
		await this.app.workspace.openLinkText(linktext, file.path, false);
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
			const clozeRegex = /::((?:.|\n)*?)::/g;
			let lastIndex = 0;
			const fragment = document.createDocumentFragment();
			let matchFoundInTextNode = false;
			let match;

			while ((match = clozeRegex.exec(textContent)) !== null) {
				matchFoundInTextNode = true;
				const clozeContent = match[1];

				if (match.index > lastIndex) {
					fragment.appendChild(
						document.createTextNode(
							textContent.substring(lastIndex, match.index),
						),
					);
				}

				if (clozeContent === this.currentItem.answer) {
					// This is the active cloze, replace with placeholder
					const placeholder = document.createElement("span");
					placeholder.setText("[...]");
					fragment.appendChild(placeholder);
				} else {
					// This is an inactive cloze, render as a capsule
					const capsule = document.createElement("span");
					capsule.addClass("fsrs-cloze-capsule");
					const iconPart = capsule.createSpan({
						cls: "fsrs-cloze-icon-part",
					});
					iconPart.setText("?");
					const textPart = capsule.createSpan({
						cls: "fsrs-cloze-text-part",
					});
					textPart.setText(clozeContent);
					fragment.appendChild(capsule);
				}
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
		this.modalEl.addClass("fsrs-quiz-modal");
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("quiz-modal-content");

		const headerContainer = contentEl.createDiv({
			cls: "quiz-header-container",
		});
		const leftContainer = headerContainer.createDiv({
			cls: "quiz-header-left",
		});
		const timerContainer = headerContainer.createDiv({
			cls: "quiz-timer-container",
		});
		timerContainer.createDiv({ cls: "quiz-timer-bar" });

		if (this.currentItem.blockId) {
			const linkEl = leftContainer.createEl("a", {
				cls: "quiz-link-icon",
			});
			linkEl.setAttribute("aria-label", "Go to source");
			setIcon(linkEl, "link");
			linkEl.onclick = () => this.navigateToSource();
		}

		const counterEl = headerContainer.createDiv({ cls: "quiz-counter" });
		const currentCardNumber = this.totalInSession - this.queue.length + 1;
		counterEl.setText(`${currentCardNumber} / ${this.totalInSession}`);

		const questionContainer = contentEl.createDiv({
			cls: "quiz-question-container",
		});
		const questionDiv = questionContainer.createEl("div", {
			cls: "quiz-question markdown-reading-view",
		});

		// The question is now always the correct context (either Q&A or the cloze line)
		// We still clean the marker for display purposes.
		let questionToRender = this.question.replace(
			/\s+\?srs\s+\^[a-zA-Z0-9]+/gm,
			"",
		);

		await MarkdownRenderer.render(
			this.app,
			questionToRender,
			questionDiv,
			this.currentItem.file.path,
			this.plugin,
		);

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
				this.triggerReplyModal(); // Go to reply modal
			}
		} else {
			const keyMap: Record<string, number> = {
				[this.context.settings.ratingAgainKey.toLowerCase()]: 1,
				[this.context.settings.ratingHardKey.toLowerCase()]: 2,
				[this.context.settings.ratingGoodKey.toLowerCase()]: 3,
				[this.context.settings.ratingEasyKey.toLowerCase()]: 4,
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
		this.boundShowAnswerOnClick = this.triggerReplyModal.bind(this); // Changed
		container.addEventListener("click", this.boundShowAnswerOnClick);
	}
	triggerReplyModal() {
		if (this.isAnswerShown) return;

		new ReplyModal(
			this.app,
			this.context,
			this.plugin,
			this.currentItem,
			(userAnswer) => {
				// This callback runs when the ReplyModal is done.
				// Now we can show the answer in *this* modal.
				this.showAnswerAndRatings(userAnswer);
			},
		).open();
	}

	async showAnswerAndRatings(userAnswer: string) {
		this.isAnswerShown = true;

		// Remove the initial "show answer" prompt
		const container = this.contentEl.querySelector(
			".quiz-question-container",
		);
		if (container) {
			container.removeEventListener("click", this.boundShowAnswerOnClick);
			container.querySelector(".quiz-show-answer-hint")?.remove();
		}
		this.modalEl.focus();

		// Now, build the answer section
		const { contentEl } = this;
		const answerContainer = contentEl.createDiv({
			cls: "quiz-answer-container",
		});

		// Display the user's typed answer
		const userAnswerEl = answerContainer.createDiv({
			cls: "quiz-user-answer",
		});
		userAnswerEl.createEl("strong", { text: "Your Answer:" });
		userAnswerEl.createEl("p", { text: userAnswer || "(empty)" });

		// Display the correct answer
		const correctAnswerEl = answerContainer.createDiv({
			cls: "quiz-correct-answer",
		});
		correctAnswerEl.createEl("strong", { text: "Correct Answer:" });
		const answerDiv = correctAnswerEl.createDiv({
			cls: "quiz-answer markdown-reading-view",
		});

		const tempDiv = createDiv();
		await MarkdownRenderer.render(
			this.app,
			this.answer,
			tempDiv,
			this.currentItem.file.path,
			this.plugin,
		);
		answerDiv.innerHTML = tempDiv.innerHTML;

		// --- Vector Similarity Highlighting Logic ---
		const clauPlugin = this.plugin.clauPlugin;
		console.log(clauPlugin, clauPlugin?.semanticSearchProvider);

		// The fix is here: access clauPlugin.search.semanticSearchProvider
		console.log(userAnswer);
		if (userAnswer && clauPlugin) {
			const userAnswerVector =
				await clauPlugin.getDocumentVector(userAnswer);
			console.log(userAnswerVector);
			if (userAnswerVector.length > 0) {
				const renderedParagraphs = answerDiv.querySelectorAll("p, li");
				console.log(renderedParagraphs);
				for (const block of Array.from(renderedParagraphs)) {
					const blockText = (block as HTMLElement).textContent || "";
					console.log(blockText);
					if (blockText.trim().length === 0) continue;
					const paragraphVector =
						await clauPlugin.getDocumentVector(blockText);

					if (paragraphVector.length > 0) {
						const similarity = this.cosineSimilarity(
							userAnswerVector,
							paragraphVector,
						);
						const color = this.interpolateColor(similarity);
						(block as HTMLElement).style.backgroundColor = color;
						(block as HTMLElement).title =
							`Similarity: ${similarity.toFixed(2)}`; // Show score on hover
						block.createEl("sup", {
							text: `${similarity.toFixed(2)}`,
							cls: "fsrs-similarity-sup",
						});
					}
				}
			}
		}
		// --- End of Logic ---

		contentEl.createEl("hr");

		const actionsContainer = contentEl.createDiv({
			cls: "quiz-actions-container",
		});

		const buryButton = actionsContainer.createEl("button", {
			text: "Bury",
			cls: `quiz-action-button`,
		});
		buryButton.setAttribute("aria-label", "Hide card until the next day");
		buryButton.onclick = () => this.handleBury();

		const suspendButton = actionsContainer.createEl("button", {
			text: "Suspend",
			cls: `quiz-action-button`,
		});
		suspendButton.setAttribute(
			"aria-label",
			"Exclude card from all future reviews until manually unsuspended",
		);
		suspendButton.onclick = () => this.handleSuspend();
		const ratingWrapper = actionsContainer.createEl("div", {
			cls: `rating-wrapper`,
		});
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
			const button = ratingWrapper.createEl("button", {
				text: `${text} (${key.toUpperCase()})`,
				cls: `quiz-rating-button quiz-rating-${color}`,
			});
			button.onclick = () => this.handleRatingByValue(value);
		});
	}

	// Replace the old cosineSimilarity function with this robust version
	private cosineSimilarity(vecA: number[], vecB: number[]): number {
		if (vecA.length !== vecB.length || vecA.length === 0) {
			return 0;
		}

		let dotProduct = 0.0;
		let magnitudeA = 0.0;
		let magnitudeB = 0.0;

		for (let i = 0; i < vecA.length; i++) {
			dotProduct += vecA[i] * vecB[i];
			magnitudeA += vecA[i] * vecA[i];
			magnitudeB += vecB[i] * vecB[i];
		}

		magnitudeA = Math.sqrt(magnitudeA);
		magnitudeB = Math.sqrt(magnitudeB);

		if (magnitudeA === 0 || magnitudeB === 0) {
			return 0;
		}

		return dotProduct / (magnitudeA * magnitudeB);
	}

	// The rest of the file (showAnswerAndRatings, etc.) remains unchanged.
	// ...

	async displayAnswer(userAnswer: string) {
		const { contentEl } = this;
		const answerContainer = contentEl.createDiv({
			cls: "quiz-answer-container",
		});

		const userAnswerEl = answerContainer.createDiv({
			cls: "quiz-user-answer",
		});
		userAnswerEl.createEl("strong", { text: "Your Answer:" });
		userAnswerEl.createEl("p", { text: userAnswer || "(empty)" });

		const correctAnswerEl = answerContainer.createDiv({
			cls: "quiz-correct-answer",
		});
		correctAnswerEl.createEl("strong", { text: "Correct Answer:" });
		const answerDiv = correctAnswerEl.createDiv({
			cls: "quiz-answer markdown-reading-view",
		});

		const tempDiv = createDiv();
		await MarkdownRenderer.render(
			this.app,
			this.answer,
			tempDiv,
			this.currentItem.file.path,
			this.plugin,
		);
		answerDiv.innerHTML = tempDiv.innerHTML;

		// --- Vector Similarity Highlighting Logic ---
		const clauPlugin = this.plugin.clauPlugin;
		if (userAnswer && clauPlugin) {
			const searchProvider = clauPlugin.semanticSearchProvider;
			const userAnswerVector =
				await searchProvider.getQueryVector(userAnswer);

			if (userAnswerVector.length > 0) {
				console.log("HELLO");
				const renderedParagraphs = answerDiv.querySelectorAll("p, li");
				console.log(renderedParagraphs);
				for (const block of Array.from(renderedParagraphs)) {
					const blockText = (block as HTMLElement).textContent || "";
					console.log(blockText);
					if (blockText.trim().length === 0) continue;
					const paragraphVector =
						await searchProvider.getQueryVector(blockText);

					if (paragraphVector.length > 0) {
						const similarity = this.cosineSimilarity(
							userAnswerVector,
							paragraphVector,
						);
						const color = this.interpolateColor(similarity);
						(block as HTMLElement).style.backgroundColor = color;
						(block as HTMLElement).title =
							`Similarity: ${similarity.toFixed(2)}`; // Show score on hover
					}
				}
			}
		}

		contentEl.createEl("hr");

		const actionsContainer = contentEl.createDiv({
			cls: "quiz-actions-container",
		});

		const buryButton = actionsContainer.createEl("button", {
			text: "Bury",
			cls: `quiz-action-button`,
		});
		buryButton.setAttribute("aria-label", "Hide card until the next day");
		buryButton.onclick = () => this.handleBury();

		const suspendButton = actionsContainer.createEl("button", {
			text: "Suspend",
			cls: `quiz-action-button`,
		});
		suspendButton.setAttribute(
			"aria-label",
			"Exclude card from all future reviews until manually unsuspended",
		);
		suspendButton.onclick = () => this.handleSuspend();
		const ratingWrapper = actionsContainer.createEl("div", {
			cls: `rating-wrapper`,
		});
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
			const button = ratingWrapper.createEl("button", {
				text: `${text} (${key.toUpperCase()})`,
				cls: `quiz-rating-button quiz-rating-${color}`,
			});
			button.onclick = () => this.handleRatingByValue(value);
		});
	}
	private interpolateColor(similarity: number): string {
		const yellow = { r: 181, g: 137, b: 0 }; // rgba(181, 137, 0, 0.3)
		const green = { r: 100, g: 206, b: 0 }; // rgba(100, 206, 36, 0.3)
		const lowerBound = 0.3;
		const upperBound = 0.9;

		if (similarity < lowerBound) {
			return "transparent";
		}
		if (similarity >= upperBound) {
			return `rgba(${green.r}, ${green.g}, ${green.b}, 0.3)`;
		}

		// Calculate the interpolation factor (0 at lowerBound, 1 at upperBound)
		const factor = (similarity - lowerBound) / (upperBound - lowerBound);

		const r = Math.round(yellow.r + factor * (green.r - yellow.r));
		const g = Math.round(yellow.g + factor * (green.g - yellow.g));
		const b = Math.round(yellow.b + factor * (green.b - yellow.b));

		return `rgba(${r}, ${g}, ${b}, 0.3)`;
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

	async handleBury() {
		this.currentItem.card.buriedUntil = moment().endOf("day").toISOString();
		await this.plugin.updateCardDataInNote(
			this.currentItem.file,
			this.currentItem.id,
			this.currentItem.card,
		);
		new Notice("Card buried until tomorrow.");
		this.proceedToNextCard();
	}

	async handleSuspend() {
		this.currentItem.card.suspended = true;
		await this.plugin.updateCardDataInNote(
			this.currentItem.file,
			this.currentItem.id,
			this.currentItem.card,
		);
		new Notice("Card suspended.");
		this.proceedToNextCard();
	}

	async proceedToNextCard() {
		this.close();

		const nextQueue = this.queue.slice(1);

		await this.plugin.updateUIDisplays();

		if (nextQueue.length > 0) {
			new QuizModal(
				this.app,
				this.context,
				this.plugin,
				nextQueue,
				this.totalInSession,
			).open();
		} else {
			new Notice("Quiz session complete!");
		}
	}

	async handleRatingByValue(ratingValue: number) {
		const wasNew = this.currentItem.card.state === State.New;
		const localRatingEnum = this.mapIntToLocalRating(ratingValue);
		if (localRatingEnum === undefined) return;

		let schedulingEngine = this.plugin.fsrsInstance;
		// Check if the card is a cram card
		if (this.currentItem.isCram) {
			schedulingEngine = fsrs({
				request_retention: this.context.settings.cramCardRetention,
				enable_short_term: true,
			});
			new Notice(
				`Cramming with ${
					this.context.settings.cramCardRetention * 100
				}% retention!`,
			);
		}

		const now = new Date();
		const schedules = schedulingEngine.repeat(this.currentItem.card, now);
		console.log(schedules);
		const updatedCard = schedules[localRatingEnum]?.card;

		if (updatedCard) {
			await this.plugin.updateCardDataInNote(
				this.currentItem.file,
				this.currentItem.id,
				updatedCard,
			);
			if (wasNew) {
				await incrementNewCardCount(this.context);
			}
			new Notice(
				`Rated - next review: ${moment(updatedCard.due).calendar()}`,
			);
		} else {
			new Notice("Error updating card schedule.", 5000);
			console.error("FSRS Error: Could not update card schedule.");
		}

		this.proceedToNextCard();
	}

	mapIntToLocalRating(ratingInt: number): Rating | undefined {
		if (Object.values(Rating).includes(ratingInt)) {
			return ratingInt as Rating;
		}
		return undefined;
	}
}
