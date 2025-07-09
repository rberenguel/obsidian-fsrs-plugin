import { App, Modal, Notice, setIcon } from "obsidian";
import FsrsPlugin from "../main";
import { PluginContext, QuizItem } from "../types";
import { QuizModal } from "./QuizModal";
import moment from "moment";
import { State } from "src/libs/fsrs";

interface BrowserItem {
	questionText: string;
	questionTextShort: string;
	filePath: string;
	fileNameShort: string;
	blockId: string;
	isCram: boolean;
	dueDateShort: string;
	status: string;
	originalIndex: number;
	selected: boolean;
	quizItem: QuizItem;
}

export class QuestionBrowserModal extends Modal {
	private plugin: FsrsPlugin;
	private context: PluginContext;
	private allItems: BrowserItem[] = [];
	private filteredItems: BrowserItem[] = [];
	private filterInput: HTMLInputElement;
	private resultsCountEl: HTMLElement;
	private tableBody: HTMLTableSectionElement;
	private studyButton: HTMLButtonElement;
	private lastSort: { column: keyof BrowserItem; ascending: boolean } = {
		column: "dueDateShort",
		ascending: true,
	};
	private selectAllCheckbox: HTMLInputElement;

	constructor(app: App, context: PluginContext, plugin: FsrsPlugin) {
		super(app);
		this.context = context;
		this.plugin = plugin;
	}

	async onOpen() {
		this.modalEl.addClass("fsrs-question-browser-modal");
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("question-browser-modal");

		const headerEl = contentEl.createDiv("question-browser-header");

		const topRow = headerEl.createDiv("question-browser-top-row");
		this.filterInput = topRow.createEl("input", {
			type: "text",
			placeholder:
				"Filter questions (e.g., q:render file:src/ui type:cram text)",
		});
		this.filterInput.value = this.context.settings.lastFilterQuery || "";

		this.studyButton = topRow.createEl("button", {
			text: "Custom Study",
			cls: "mod-cta",
		});

		this.resultsCountEl = headerEl.createDiv({
			cls: "question-browser-results-count",
		});

		const tableContainer = contentEl.createDiv(
			"question-browser-table-container",
		);
		const table = tableContainer.createEl("table");
		const thead = table.createTHead();
		this.tableBody = table.createTBody();
		this.renderHeader(thead);

		await this.loadAndPrepareData();
		this.applyFilter();
		this.addEventListeners();
	}

	private addEventListeners() {
		let debounceTimer: number;
		this.filterInput.addEventListener("input", () => {
			clearTimeout(debounceTimer);
			debounceTimer = window.setTimeout(() => {
				this.applyFilter();
				this.context.settings.lastFilterQuery = this.filterInput.value;
				this.plugin.saveSettings();
			}, 250);
		});

		this.studyButton.addEventListener("click", () => {
			const selectedItems = this.allItems
				.filter((item) => item.selected)
				.map((item) => item.quizItem);
			if (selectedItems.length > 0) {
				this.close();
				this.plugin.startQuizSession(selectedItems);
			} else {
				new Notice("No questions selected for custom study.");
			}
		});

		this.selectAllCheckbox.addEventListener("change", (e) => {
			const isChecked = (e.target as HTMLInputElement).checked;
			this.filteredItems.forEach((item) => {
				item.selected = isChecked;
			});
			this.updateVisibleRows();
		});

		this.tableBody.addEventListener("click", (e) => {
			const target = e.target as HTMLElement;
			const link = target.closest(".internal-link");
			if (link) {
				e.preventDefault();
				const href = link.getAttribute("data-href");
				if (href) {
					this.app.workspace.openLinkText(href, "", false);
					this.close();
				}
			}
		});
	}
	private updateVisibleRows() {
		const rows = this.tableBody.querySelectorAll("tr");
		rows.forEach((row) => {
			const originalIndexStr = row.dataset.originalIndex;
			if (originalIndexStr) {
				const itemIndex = parseInt(originalIndexStr, 10);
				const item = this.allItems.find(
					(i) => i.originalIndex === itemIndex,
				);
				if (item) {
					const checkbox = row.querySelector(
						'input[type="checkbox"]',
					) as HTMLInputElement;
					if (checkbox) {
						checkbox.checked = item.selected;
					}
				}
			}
		});
	}
	private renderHeader(thead: HTMLTableSectionElement) {
		const headerRow = thead.insertRow();
		this.selectAllCheckbox = headerRow
			.createEl("th")
			.createEl("input", { type: "checkbox" });
		this.createSortableHeader(
			headerRow,
			"Question",
			"questionTextShort",
			"fsrs-browser-q-col",
		);
		this.createSortableHeader(
			headerRow,
			"Status",
			"status",
			"fsrs-browser-s-col",
		);
		this.createSortableHeader(
			headerRow,
			"File",
			"fileNameShort",
			"fsrs-browser-f-col",
		);
		this.createSortableHeader(
			headerRow,
			"Type",
			"isCram",
			"fsrs-browser-t-col",
		);
		this.createSortableHeader(
			headerRow,
			"Due",
			"dueDateShort",
			"fsrs-browser-d-col",
		);
		headerRow.createEl("th", { text: "Actions" });
	}

	private createSortableHeader(
		row: HTMLTableRowElement,
		text: string,
		sortKey: keyof BrowserItem,
		klass?: string,
	) {
		const th = row.createEl("th", { text, cls: klass });
		th.dataset.sortBy = sortKey;
		th.addEventListener("click", () => {
			if (this.lastSort.column === sortKey) {
				this.lastSort.ascending = !this.lastSort.ascending;
			} else {
				this.lastSort = { column: sortKey, ascending: true };
			}
			this.sortAndRender();
		});
	}

	private async loadAndPrepareData() {
		const rawItems = await this.plugin.getQuizItems();
		this.allItems = rawItems.map((item, index) =>
			this.formatItemForBrowser(item, index),
		);
	}

	private formatItemForBrowser(item: QuizItem, index: number): BrowserItem {
		const questionText = item.isCloze
			? item.rawQuestionText || ""
			: item.question;
		return {
			questionText: questionText,
			questionTextShort: questionText,
			filePath: item.file.path,
			fileNameShort:
				item.file.basename.substring(0, 20) +
				(item.file.basename.length > 20 ? "..." : ""),
			blockId: item.blockId || item.id,
			isCram: item.isCram,
			dueDateShort:
				item.card.state === "new" || item.card.state === State.New
					? "New"
					: this.formatDueDate(item.card.due),
			status: this.getCardStatus(item),
			originalIndex: index,
			selected: false,
			quizItem: item,
		};
	}

	private getCardStatus(item: QuizItem): string {
		if (item.card.suspended) {
			return "Suspended";
		}
		if (item.card.buriedUntil) {
			const buriedUntil = moment(item.card.buriedUntil);
			if (buriedUntil.isAfter(moment())) {
				const today = moment().startOf("day");
				if (buriedUntil.isSame(today, "day")) {
					return `Buried (Today)`;
				}
				return `Buried (${buriedUntil.fromNow()})`;
			}
		}
		return "";
	}

	private formatDueDate(due: Date): string {
		const dueDate = moment(due);
		if (!dueDate.isValid()) return "Invalid";
		const today = moment().startOf("day");
		if (dueDate.isBefore(today)) return "Overdue";
		if (dueDate.isSame(today, "day")) return "Today";
		if (dueDate.isSame(today.clone().add(1, "day"), "day"))
			return "Tomorrow";
		return `In ${dueDate.diff(today, "days")}d`;
	}

	private parseQuery(query: string): {
		q?: string;
		file?: string;
		type?: string;
		status?: string;
		text: string;
	} {
		const result: {
			q?: string;
			file?: string;
			type?: string;
			status?: string;
			text: string;
		} = { text: "" };
		const qRegex = /q:\s*(\S+)/;
		const fileRegex = /file:\s*(\S+)/;
		const typeRegex = /type:\s*(cram|normal)/;
		const statusRegex = /status:\s*(suspended|buried)/;

		let remainingQuery = query;

		const qMatch = remainingQuery.match(qRegex);
		if (qMatch) {
			result.q = qMatch[1];
			remainingQuery = remainingQuery.replace(qMatch[0], "").trim();
		}

		const fileMatch = remainingQuery.match(fileRegex);
		if (fileMatch) {
			result.file = fileMatch[1];
			remainingQuery = remainingQuery.replace(fileMatch[0], "").trim();
		}

		const typeMatch = remainingQuery.match(typeRegex);
		if (typeMatch) {
			result.type = typeMatch[1];
			remainingQuery = remainingQuery.replace(typeMatch[0], "").trim();
		}

		const statusMatch = remainingQuery.match(statusRegex);
		if (statusMatch) {
			result.status = statusMatch[1];
			remainingQuery = remainingQuery.replace(statusMatch[0], "").trim();
		}

		result.text = remainingQuery.toLowerCase();
		return result;
	}

	private applyFilter() {
		const query = this.parseQuery(this.filterInput.value.toLowerCase());
		this.filteredItems = this.allItems.filter((item) => {
			if (query.q && !item.questionText.toLowerCase().includes(query.q))
				return false;
			if (query.file && !item.filePath.toLowerCase().includes(query.file))
				return false;
			if (
				query.type &&
				(query.type === "cram" ? !item.isCram : item.isCram)
			)
				return false;
			if (
				query.status &&
				!item.status.toLowerCase().includes(query.status)
			)
				return false;
			if (query.text) {
				const searchText = query.text;
				const searchableContent = [
					item.questionText.toLowerCase(),
					item.filePath.toLowerCase(),
					item.status.toLowerCase(),
					item.dueDateShort.toLowerCase(),
				].join(" ");

				if (!searchableContent.includes(searchText)) {
					return false;
				}
			}
			return true;
		});

		this.sortAndRender();
	}

	private sortAndRender() {
		const { column, ascending } = this.lastSort;

		this.filteredItems.sort((a, b) => {
			let comparison = 0;
			if (column === "dueDateShort") {
				const aDate =
					a.quizItem.card.state === "new" ||
					a.quizItem.card.state === State.New
						? moment(0)
						: moment(a.quizItem.card.due);
				const bDate =
					b.quizItem.card.state === "new" ||
					b.quizItem.card.state === State.New
						? moment(0)
						: moment(b.quizItem.card.due);

				if (aDate.isBefore(bDate)) {
					comparison = -1;
				} else if (aDate.isAfter(bDate)) {
					comparison = 1;
				}
			} else {
				const aVal = a[column];
				const bVal = b[column];
				if (typeof aVal === "string" && typeof bVal === "string") {
					comparison = aVal.localeCompare(bVal);
				} else if (
					typeof aVal === "boolean" &&
					typeof bVal === "boolean"
				) {
					comparison = aVal === bVal ? 0 : aVal ? -1 : 1;
				}
			}
			return ascending ? comparison : -comparison;
		});

		this.renderTable();
	}

	private renderTable() {
		this.tableBody.empty();
		this.filteredItems.forEach((item) => {
			const row = this.tableBody.insertRow();
			row.dataset.originalIndex = String(item.originalIndex);

			const cellCheckbox = row.insertCell();
			const checkbox = cellCheckbox.createEl("input", {
				type: "checkbox",
			});
			checkbox.checked = item.selected;
			checkbox.addEventListener("change", () => {
				item.selected = checkbox.checked;
			});

			const cellQuestion = row.insertCell();
			cellQuestion.addClass("fsrs-browser-q-col");
			cellQuestion.createEl("a", {
				text: item.questionTextShort,
				href: `#`,
				attr: {
					"data-href": `${item.filePath}#^${item.blockId}`,
					"aria-label": item.questionText,
				},
				cls: "internal-link",
			});

			const cellStatus = row.insertCell();
			cellStatus.addClass("fsrs-browser-s-col");
			cellStatus.setText(item.status);

			const cellFile = row.insertCell();
			cellFile.addClass("fsrs-browser-f-col");
			cellFile.createEl("a", {
				text: item.fileNameShort,
				href: `#`,
				attr: {
					"data-href": item.filePath,
					"aria-label": item.filePath,
				},
				cls: "internal-link",
			});

			const cellType = row.insertCell();
			const icon = item.isCram ? "zap" : "help-circle";
			setIcon(cellType, icon);
			cellType.title = item.isCram ? "Cram Question" : "Normal Question";
			cellType.addClass("fsrs-browser-t-col");
			const cellDue = row.insertCell();
			cellDue.addClass("fsrs-browser-d-col");
			cellDue.setText(item.dueDateShort);

			const cellActions = row.insertCell();
			const suspendButton = cellActions.createEl("button");
			const isSuspended = item.quizItem.card.suspended;

			setIcon(
				suspendButton,
				isSuspended ? "refresh-cw" : "refresh-cw-off",
			);
			suspendButton.setAttribute(
				"aria-label",
				isSuspended ? "Unsuspend" : "Suspend",
			);

			suspendButton.addEventListener("click", async () => {
				const card = item.quizItem.card;
				card.suspended = !card.suspended;
				await this.plugin.updateCardDataInNote(
					item.quizItem.file,
					item.quizItem.id,
					card,
				);
				new Notice(
					`Card has been ${
						card.suspended ? "suspended" : "unsuspended"
					}.`,
				);

				// Update the in-memory item
				item.status = this.getCardStatus(item.quizItem);

				// Update the DOM
				row.cells[2].setText(item.status);
				const isSuspended = item.quizItem.card.suspended;
				setIcon(
					suspendButton,
					isSuspended ? "refresh-cw" : "refresh-cw-off",
				);
				suspendButton.setAttribute(
					"aria-label",
					isSuspended ? "Unsuspend" : "Suspend",
				);
			});
		});

		this.resultsCountEl.setText(
			`Showing ${this.filteredItems.length} of ${this.allItems.length} questions`,
		);
	}

	async refreshView() {
		await this.loadAndPrepareData();
		this.applyFilter();
	}
}
