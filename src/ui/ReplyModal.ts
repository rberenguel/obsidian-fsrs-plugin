import { App, Modal, TextAreaComponent, ButtonComponent } from "obsidian";
import FsrsPlugin from "../main";
import { PluginContext, QuizItem } from "../types";
import { MarkdownRenderer } from "obsidian";

export class ReplyModal extends Modal {
	private plugin: FsrsPlugin;
	private context: PluginContext;
	private quizItem: QuizItem;
	private userAnswer: string = "";
	private onReply: (userAnswer: string) => void;

	constructor(
		app: App,
		context: PluginContext,
		plugin: FsrsPlugin,
		quizItem: QuizItem,
		onReply: (userAnswer: string) => void,
	) {
		super(app);
		this.context = context;
		this.plugin = plugin;
		this.quizItem = quizItem;
		this.onReply = onReply;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("fsrs-reply-modal-content");

		// Display the question
		const questionDiv = contentEl.createDiv({
			cls: "quiz-question markdown-reading-view",
		});
		const questionToRender = this.quizItem.question.replace(
			/\s+\?srs(?: \([^)]+\))?\s+\^\w+/gm,
			"",
		);
		MarkdownRenderer.render(
			this.app,
			questionToRender,
			questionDiv,
			this.quizItem.file.path,
			this.plugin,
		);

		// Text area for user's answer
		const textArea = new TextAreaComponent(contentEl)
			.setPlaceholder("Type your answer here...")
			.onChange((value) => {
				this.userAnswer = value;
			});
		textArea.inputEl.addClass("fsrs-reply-modal-textarea");

		// "Reply" button
		const replyButton = new ButtonComponent(contentEl)
			.setButtonText("Reply")
			.setCta()
			.onClick(() => {
				this.onReply(this.userAnswer);
				this.close();
			});
		replyButton.buttonEl.addClass("fsrs-reply-modal-button");

		// Handle Enter key to submit
		textArea.inputEl.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter" && !evt.shiftKey) {
				evt.preventDefault();
				this.onReply(this.userAnswer);
				this.close();
			}
		});

		setTimeout(() => textArea.inputEl.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
	}
}
