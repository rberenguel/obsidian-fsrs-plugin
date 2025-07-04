import { ItemView, WorkspaceLeaf, moment } from "obsidian";
import type FsrsPlugin from "../main";
import {
	Calendar,
	configureGlobalMomentLocale,
	ICalendarSource,
	IDayMetadata,
} from "obsidian-calendar-ui";
import { dailyReset } from "src/logic/state";
import { getAllReviewItems } from "src/logic/scheduler";
import { PluginContext } from "src/types";

export const FSRS_CALENDAR_VIEW_TYPE = "fsrs-calendar-view";

export class CalendarView extends ItemView {
	private context: PluginContext;
	private calendar: Calendar | null = null;
	private isRedrawing = false;

	constructor(leaf: WorkspaceLeaf, context: PluginContext) {
		super(leaf);
		this.context = context;
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

					if (!counts) return { classes: [] };
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
							color: "var(--color-grey)",
							isFilled: true,
							className: "dot-grey",
						}),
					);
					const newDots = Array.from(
						{ length: counts.new || 0 },
						() => ({
							color: "var(--color-green)",
							isFilled: true,
							className: "dot-green",
						}),
					);

					const allDots = [
						...overdueDots,
						...todayDots,
						...futureDots,
						...newDots,
					];
					const totalCount = allDots.length;

					if (totalCount > 0) {
						return {
							dots: allDots,
							dataAttributes: {
								"fsrs-due-new": String(counts.new || 0),
								"fsrs-due-overdue": String(counts.overdue || 0),
								"fsrs-due-today": String(counts.today || 0),
								"fsrs-due-future": String(counts.future || 0),
							},
						};
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
						// Build the detailed tooltip string
						const newCount = parseInt(
							targetEl.getAttribute("fsrs-due-new") || "0",
						);
						const overdueCount = parseInt(
							targetEl.getAttribute("fsrs-due-overdue") || "0",
						);
						const laterTodayCount = parseInt(
							targetEl.getAttribute("fsrs-due-today") || "0",
						);
						const futureCount = parseInt(
							targetEl.getAttribute("fsrs-due-future") || "0",
						);

						// "Due" cards are red (overdue) and grey (future scheduled)
						const dueCount = overdueCount + futureCount;

						const parts: string[] = [];
						if (newCount > 0) {
							parts.push(
								`${newCount} new card${newCount > 1 ? "s" : ""}`,
							);
						}
						if (dueCount > 0) {
							parts.push(
								`${dueCount} card${dueCount > 1 ? "s" : ""} due`,
							);
						}
						if (laterTodayCount > 0) {
							parts.push(
								`${laterTodayCount} card${laterTodayCount > 1 ? "s" : ""} due later`,
							);
						}

						if (parts.length > 0) {
							targetEl.setAttribute(
								"aria-label",
								parts.join("\n"),
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

	private async getAllDueDates(): Promise<
		Record<
			string,
			{ overdue: number; today: number; future: number; new: number }
		>
	> {
		await dailyReset(this.context);
		const allItems = await getAllReviewItems(this.context);
		const dueDates: Record<
			string,
			{ overdue: number; today: number; future: number; new: number }
		> = {};

		const now = window.moment();
		const todayStart = now.clone().startOf("day");

		const scheduledReviews = allItems.filter(
			(item) => item.card.state && item.card.state !== "new",
		);
		const allNewCards = allItems.filter(
			(item) => !item.card.state || item.card.state === "new",
		);

		// 1. Process all scheduled reviews
		for (const item of scheduledReviews) {
			if (!item.card.due) continue;
			const dueDate = window.moment(item.card.due);
			if (!dueDate.isValid()) continue;

			const dueDay = dueDate.clone().startOf("day");
			const dateStr = dueDay.format("YYYY-MM-DD");

			if (!dueDates[dateStr]) {
				dueDates[dateStr] = { overdue: 0, today: 0, future: 0, new: 0 };
			}

			if (dueDate.isSameOrBefore(now)) {
				// Due now or in the past (red dot on today's date)
				const todayStr = todayStart.format("YYYY-MM-DD");
				if (!dueDates[todayStr]) {
					dueDates[todayStr] = {
						overdue: 0,
						today: 0,
						future: 0,
						new: 0,
					};
				}
				dueDates[todayStr].overdue++;
			} else if (dueDay.isSame(todayStart)) {
				// Due later today (orange dot)
				dueDates[dateStr].today++;
			} else {
				// Due on a future date (grey dot)
				dueDates[dateStr].future++;
			}
		}

		// 2. Process all new cards with spill-over logic
		const newCardsToShowToday = Math.max(
			0,
			this.context.settings.maxNewCardsPerDay -
				this.context.settings.newCardsReviewedToday,
		);
		let remainingNewCards = [...allNewCards];

		// Add green dots for today
		if (newCardsToShowToday > 0) {
			const todayStr = todayStart.format("YYYY-MM-DD");
			if (!dueDates[todayStr]) {
				dueDates[todayStr] = {
					overdue: 0,
					today: 0,
					future: 0,
					new: 0,
				};
			}
			const cardsForToday = Math.min(
				remainingNewCards.length,
				newCardsToShowToday,
			);
			dueDates[todayStr].new += cardsForToday;
			remainingNewCards.splice(0, cardsForToday);
		}

		// Project the rest onto future days
		let dayOffset = 1;
		while (remainingNewCards.length > 0) {
			const dateForDots = todayStart.clone().add(dayOffset, "days");
			const dateStr = dateForDots.format("YYYY-MM-DD");
			if (!dueDates[dateStr]) {
				dueDates[dateStr] = { overdue: 0, today: 0, future: 0, new: 0 };
			}
			const cardsForDay = Math.min(
				remainingNewCards.length,
				this.context.settings.maxNewCardsPerDay,
			);
			dueDates[dateStr].new += cardsForDay;
			remainingNewCards.splice(0, cardsForDay);
			dayOffset++;
			if (dayOffset > 1000) break; // Safety break
		}

		return dueDates;
	}
}
