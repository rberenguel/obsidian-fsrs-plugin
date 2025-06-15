import { ItemView, WorkspaceLeaf, Notice, moment } from "obsidian";
import type FsrsPlugin from "./main";
import { Calendar, configureGlobalMomentLocale, ICalendarSource, IDayMetadata } from "obsidian-calendar-ui";
import { createEmptyCard } from "./fsrs";
import type { Card } from "./main";

export const FSRS_CALENDAR_VIEW_TYPE = "fsrs-calendar-view";

export class CalendarView extends ItemView {
	private plugin: FsrsPlugin;
	private calendar: Calendar | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: FsrsPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return FSRS_CALENDAR_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "FSRS Calendar";
	}

	getIcon(): string {
		return "calendar-days";
	}

	protected async onOpen(): Promise<void> {
		const locale = window.moment.locale();
		configureGlobalMomentLocale(locale, "monday");

		this.contentEl.empty();
		this.contentEl.style.padding = "12px";

		const dueDates = await this.getAllDueDates();

		const calendarSource: ICalendarSource = {
			getDailyMetadata: async (date: moment.Moment) => {
				const dateStr = date.format("YYYY-MM-DD");
				const counts = dueDates[dateStr];

				if (counts && (counts.overdue > 0 || counts.today > 0 || counts.future > 0)) {
					const overdueDots = Array.from({ length: counts.overdue || 0 }, () => ({
						color: "var(--color-red)",
						isFilled: true,
						className: "dot-red",
					}));
					const todayDots = Array.from({ length: counts.today || 0 }, () => ({
						color: "var(--color-orange)",
						isFilled: true,
						className: "dot-orange",
					}));
					const futureDots = Array.from({ length: counts.future || 0 }, () => ({
						color: "var(--color-cyan)",
						isFilled: true,
						className: "dot-cyan",
					}));

					const allDots = [...overdueDots, ...todayDots, ...futureDots];
					const totalCount = allDots.length;

					if (totalCount > 0) {
						const md: IDayMetadata = {
							dots: allDots,
							dataAttributes: { "fsrs-due-count": String(totalCount) },
							classes: []
						};
						return md
					}
				}
				return { classes: [] };
			},
			getWeeklyMetadata: async (date: moment.Moment) => {
				return {
					classes: []
				}
			}
		};

		this.calendar = new Calendar({
			target: this.contentEl,
			props: {
				localeData: window.moment().localeData(),
				sources: [calendarSource],
				showWeekNums: true,
				onHoverDay: (date: moment.Moment, targetEl: HTMLElement) => {
					const count = targetEl.getAttribute("fsrs-due-count");
					if (count) {
						targetEl.setAttribute(
							"aria-label",
							`${count} card${parseInt(count) !== 1 ? "s" : ""} due`,
						);
					}
				},
			},
		});

        setTimeout(() => {
			const titleEl = this.contentEl.querySelector(".title");
			if (titleEl && !titleEl.querySelector(".fsrs-calendar-badge")) {
				titleEl.createSpan({
					text: "FSRS",
					cls: "fsrs-calendar-badge"
				});
			}
		}, 0);
	}

	protected async onClose(): Promise<void> {
		if (this.calendar) {
			this.calendar.$destroy();
			this.calendar = null;
		}
		this.contentEl.empty();
	}

	private async getAllDueDates(): Promise<Record<string, { overdue: number; today: number; future: number }>> {
		const quizNotes = await this.plugin.getQuizNotes();
		const dueDates: Record<string, { overdue: number; today: number; future: number }> = {};
		const today = window.moment().startOf('day');

		const processCard = (card: Card) => {
			if (!card || !card.due) return;
			const dueDateObj = typeof card.due === "string" ? new Date(card.due) : card.due;
			if (!(dueDateObj instanceof Date) || isNaN(dueDateObj.getTime())) return;

			const dueMoment = window.moment(dueDateObj).startOf('day');

			if (dueMoment.isBefore(today)) {
				const todayStr = today.format("YYYY-MM-DD");
				if (!dueDates[todayStr]) dueDates[todayStr] = { overdue: 0, today: 0, future: 0 };
				dueDates[todayStr].overdue++;
			} else if (dueMoment.isSame(today, 'day')) {
				const todayStr = today.format("YYYY-MM-DD");
				if (!dueDates[todayStr]) dueDates[todayStr] = { overdue: 0, today: 0, future: 0 };
				dueDates[todayStr].today++;
			} else { // isAfter
				const dateStr = dueMoment.format("YYYY-MM-DD");
				if (!dueDates[dateStr]) dueDates[dateStr] = { overdue: 0, today: 0, future: 0 };
				dueDates[dateStr].future++;
			}
		};

		for (const noteFile of quizNotes) {
			try {
				const rawFileContent = await this.app.vault.read(noteFile);
				let bodyContentOnly = rawFileContent;
				const fileCache = this.app.metadataCache.getFileCache(noteFile);
				const yamlEndOffset = fileCache?.frontmatterPosition?.end?.offset;
				if (yamlEndOffset && yamlEndOffset > 0 && yamlEndOffset <= rawFileContent.length) {
					bodyContentOnly = rawFileContent.substring(yamlEndOffset);
				}
				bodyContentOnly = bodyContentOnly.trimStart();

				const { fsrsData, identifiedClozes } = this.plugin.parseNoteContent(bodyContentOnly);

				if (identifiedClozes.length > 0) {
					let fsrsDataMapForClozes: Record<string, Card> = {};
					if (fsrsData && typeof fsrsData === "object" && !Array.isArray(fsrsData)) {
						fsrsDataMapForClozes = fsrsData as Record<string, Card>;
					}
					for (const cloze of identifiedClozes) {
						const card: Card = fsrsDataMapForClozes[cloze.id] || (createEmptyCard(new Date()) as Card);
						processCard(card);
					}
				} else {
					if (fsrsData && typeof fsrsData === "object" && fsrsData.hasOwnProperty("due")) {
						processCard(fsrsData as Card);
					}
				}
			} catch (e) {
				console.error(`FSRS Calendar: Error processing note ${noteFile.path}`, e);
			}
		}
		return dueDates;
	}
}