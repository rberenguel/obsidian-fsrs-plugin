import { ItemView, WorkspaceLeaf, moment } from "obsidian";
import type FsrsPlugin from "./main";
import {
	Calendar,
	configureGlobalMomentLocale,
	ICalendarSource,
	IDayMetadata,
} from "obsidian-calendar-ui";

export const FSRS_CALENDAR_VIEW_TYPE = "fsrs-calendar-view";

export class CalendarView extends ItemView {
	private plugin: FsrsPlugin;
	private calendar: Calendar | null = null;
	private isRedrawing = false;

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

	public async redraw(): Promise<void> {
		if (this.isRedrawing) return;
		this.isRedrawing = true;

		try {
			if (this.calendar) {
				this.calendar.$destroy();
			}
			this.contentEl.empty();
			this.contentEl.style.padding = "12px";

			configureGlobalMomentLocale(window.moment.locale(), "monday");

			const dueDates = await this.getAllDueDates();

			const calendarSource: ICalendarSource = {
				getDailyMetadata: async (date: moment.Moment) => {
					const dateStr = date.format("YYYY-MM-DD");
					const counts = dueDates[dateStr];

					if (
						counts &&
						(counts.overdue > 0 ||
							counts.today > 0 ||
							counts.future > 0)
					) {
						// This logic is restored from the original to include classNames
						const overdueDots = Array.from(
							{ length: counts.overdue || 0 },
							() => ({
								color: "var(--color-red)",
								isFilled: true,
								className: "dot-red",
							}),
						);
						const todayDots = Array.from(
							{ length: counts.today || 0 },
							() => ({
								color: "var(--color-orange)",
								isFilled: true,
								className: "dot-orange",
							}),
						);
						const futureDots = Array.from(
							{ length: counts.future || 0 },
							() => ({
								color: "var(--color-cyan)",
								isFilled: true,
								className: "dot-cyan",
							}),
						);

						const allDots = [
							...overdueDots,
							...todayDots,
							...futureDots,
						];
						const totalCount = allDots.length;

						if (totalCount > 0) {
							return {
								dots: allDots,
								dataAttributes: {
									"fsrs-due-count": String(totalCount),
								},
							};
						}
					}
					return { classes: [] };
				},
				getWeeklyMetadata: async () => ({ classes: [] }),
			};

			this.calendar = new Calendar({
				target: this.contentEl,
				props: {
					localeData: window.moment().localeData(),
					sources: [calendarSource],
					showWeekNums: true,
					onHoverDay: (
						date: moment.Moment,
						targetEl: HTMLElement,
					) => {
						const count = targetEl.getAttribute("fsrs-due-count");
						if (count) {
							targetEl.setAttribute(
								"aria-label",
								`${count} card${
									parseInt(count) !== 1 ? "s" : ""
								} due`,
							);
						}
					},
				},
			});
		} finally {
			this.isRedrawing = false;
		}
	}

	protected async onOpen(): Promise<void> {
		await this.redraw();
	}

	protected async onClose(): Promise<void> {
		if (this.calendar) {
			this.calendar.$destroy();
			this.calendar = null;
		}
	}

	// In CalendarView.ts
	private async getAllDueDates(): Promise<
		Record<string, { overdue: number; today: number; future: number }>
	> {
		const allItems = await this.plugin.getAllReviewItems();
		const dueDates: Record<
			string,
			{ overdue: number; today: number; future: number }
		> = {};

		const now = window.moment();
		const todayStart = now.clone().startOf("day");

		for (const item of allItems) {
			if (!item.card || !item.card.due) continue;

			const dueDate = window.moment(item.card.due);
			if (!dueDate.isValid()) continue;

			const dueDay = dueDate.clone().startOf("day");
			const todayStr = todayStart.format("YYYY-MM-DD");

			if (!dueDates[todayStr]) {
				dueDates[todayStr] = { overdue: 0, today: 0, future: 0 };
			}

			if (dueDate.isSameOrBefore(now)) {
				// Anything due in the past or right now is "overdue" for review.
				// This will be rendered as a RED dot on today's calendar entry.
				dueDates[todayStr].overdue++;
			} else if (dueDay.isSame(todayStart)) {
				// It's due later today.
				// This will be rendered as an ORANGE dot on today's calendar entry.
				dueDates[todayStr].today++;
			} else {
				// It's due on a future date.
				// This will be rendered as a CYAN dot on the specific future date.
				const dateStr = dueDay.format("YYYY-MM-DD");
				if (!dueDates[dateStr]) {
					dueDates[dateStr] = { overdue: 0, today: 0, future: 0 };
				}
				dueDates[dateStr].future++;
			}
		}
		return dueDates;
	}
}
