import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	getDueReviewItems,
	getAllReviewItems,
} from "../../src/logic/scheduler";
import { PluginContext, Card, QuizItem } from "../../src/types";
import { FSRS, Rating, State } from "../../src/libs/fsrs";

// Mock the parser module
vi.mock("../../src/logic/parser");
import { processFile } from "../../src/logic/parser";

// Mock the state module
vi.mock("../../src/logic/state");
import { dailyReset } from "../../src/logic/state";

describe("Scheduler", () => {
	beforeEach(() => {
		// Reset mocks before each test
		vi.clearAllMocks();
	});

	it("getDueReviewItems should not return suspended cards", async () => {
		const mockContext = {
			settings: { maxNewCardsPerDay: 10, newCardsReviewedToday: 0 },
		} as unknown as PluginContext;
		const allItems: QuizItem[] = [
			{
				id: "1",
				card: { suspended: true, due: new Date() } as Card,
			} as QuizItem,
			{
				id: "2",
				card: { due: new Date(), state: State.Review } as Card,
			} as QuizItem,
		];

		const dueItems = await getDueReviewItems(mockContext, allItems);
		expect(dueItems.length).toBe(1);
		expect(dueItems[0].id).toBe("2");
	});

	it("getDueReviewItems should not return buried cards that are not yet due", async () => {
		const mockContext = {
			settings: { maxNewCardsPerDay: 10, newCardsReviewedToday: 0 },
		} as unknown as PluginContext;
		const tomorrow = new Date();
		tomorrow.setDate(tomorrow.getDate() + 1);

		const allItems: QuizItem[] = [
			{
				id: "1",
				card: {
					buriedUntil: tomorrow.toISOString(),
					due: new Date(),
				} as Card,
			} as QuizItem,
			{
				id: "2",
				card: { due: new Date(), state: State.Review } as Card,
			} as QuizItem,
		];

		const dueItems = await getDueReviewItems(mockContext, allItems);
		expect(dueItems.length).toBe(1);
		expect(dueItems[0].id).toBe("2");
	});

	it("getDueReviewItems should return buried cards that are now due", async () => {
		const mockContext = {
			settings: { maxNewCardsPerDay: 10, newCardsReviewedToday: 0 },
		} as unknown as PluginContext;
		const yesterday = new Date();
		yesterday.setDate(yesterday.getDate() - 1);

		const allItems: QuizItem[] = [
			{
				id: "1",
				card: {
					buriedUntil: yesterday.toISOString(),
					due: new Date(),
					state: State.Review,
				} as Card,
			} as QuizItem,
			{
				id: "2",
				card: { due: new Date(), state: State.Review } as Card,
			} as QuizItem,
		];

		const dueItems = await getDueReviewItems(mockContext, allItems);
		expect(dueItems.length).toBe(2);
	});

	it("getDueReviewItems should return due cards plus a limited number of new cards", async () => {
		// Arrange
		const now = new Date();
		const yesterday = new Date(now.getTime() - 86400000);

		const mockContext = {
			settings: { maxNewCardsPerDay: 5, newCardsReviewedToday: 3 },
			app: {
				vault: { getMarkdownFiles: () => [{ path: "test.md" }] },
				metadataCache: {
					getFileCache: () => ({ frontmatter: { fsrs: 0 } }),
				},
			},
			saveSettings: vi.fn(),
		} as unknown as PluginContext;

		const allItems: QuizItem[] = [
			{
				id: "dueCard1",
				card: { state: State.Review, due: yesterday } as Card,
			} as QuizItem,
			{
				id: "newCard1",
				card: { state: State.New, due: now } as Card,
			} as QuizItem,
			{
				id: "newCard2",
				card: { state: State.New, due: now } as Card,
			} as QuizItem,
			{
				id: "newCard3",
				card: { state: State.New, due: now } as Card,
			} as QuizItem,
		];

		// Act
		const dueItems = await getDueReviewItems(mockContext, allItems);
		const newCards = dueItems.filter(
			(item) => item.card.state === State.New,
		);
		const dueCards = dueItems.filter(
			(item) => item.card.state === State.Review,
		);

		// Assert
		expect(dailyReset).toHaveBeenCalledWith(mockContext);
		expect(dueItems.length).toBe(3);
		expect(dueCards.length).toBe(1);
		expect(newCards.length).toBe(2);
	});

	it("getDueReviewItems should return no new cards if the daily limit is reached", async () => {
		// Arrange
		const yesterday = new Date(new Date().getTime() - 86400000);

		const mockContext = {
			settings: { maxNewCardsPerDay: 5, newCardsReviewedToday: 5 }, // Limit reached
			app: {
				vault: { getMarkdownFiles: () => [{ path: "test.md" }] },
				metadataCache: {
					getFileCache: () => ({ frontmatter: { fsrs: 0 } }),
				},
			},
			saveSettings: vi.fn(),
		} as unknown as PluginContext;

		const allItems: QuizItem[] = [
			{
				id: "dueCard1",
				card: { state: State.Review, due: yesterday } as Card,
			} as QuizItem,
			{
				id: "newCard1",
				card: { state: State.New, due: new Date() } as Card,
			} as QuizItem,
		];

		// Act
		const dueItems = await getDueReviewItems(mockContext, allItems);

		// Assert
		expect(dueItems.length).toBe(1); // Only the due card
		expect(dueItems[0].id).toBe("dueCard1");
	});

	it("should shuffle new cards when the setting is enabled", async () => {
		// Arrange
		const mockContext = {
			settings: {
				maxNewCardsPerDay: 5,
				newCardsReviewedToday: 0,
				shuffleNewCards: true,
			},
			app: {
				vault: { getMarkdownFiles: () => [{ path: "test.md" }] },
				metadataCache: {
					getFileCache: () => ({ frontmatter: { fsrs: 0 } }),
				},
			},
			saveSettings: vi.fn(),
		} as unknown as PluginContext;

		const allItems: QuizItem[] = [
			{
				id: "n1",
				card: { state: State.New, due: new Date() } as Card,
			} as QuizItem,
			{
				id: "n2",
				card: { state: State.New, due: new Date() } as Card,
			} as QuizItem,
			{
				id: "n3",
				card: { state: State.New, due: new Date() } as Card,
			} as QuizItem,
		];

		const randomSpy = vi.spyOn(Math, "random");
		randomSpy.mockReturnValueOnce(0.1).mockReturnValueOnce(0.9);

		// Act
		const dueItems = await getDueReviewItems(mockContext, allItems);
		const originalOrder = ["n1", "n2", "n3"];
		const newOrder = dueItems.map((item) => item.id);

		// Assert
		expect(dueItems.length).toBe(3);
		expect(newOrder.length).toBe(3);
		expect(newOrder).not.toEqual(originalOrder);
		expect(newOrder).toEqual(["n3", "n2", "n1"]);

		randomSpy.mockRestore();
	});
	it("should use custom retention for cram cards", async () => {
		// Arrange
		const now = new Date();
		const mockContext = {
			settings: {
				maxNewCardsPerDay: 5,
				newCardsReviewedToday: 0,
				cramCardRetention: 0.99, // High retention for testing
			},
			app: {
				vault: { getMarkdownFiles: () => [{ path: "test.md" }] },
				metadataCache: {
					getFileCache: () => ({ frontmatter: { fsrs: true } }),
				},
			},
			saveSettings: vi.fn(),
		} as unknown as PluginContext;

		const lastReviewDate = new Date(now);
		lastReviewDate.setDate(now.getDate() - 10); // Set last review 10 days ago

		const allItems: QuizItem[] = [
			{
				id: "cramCard1",
				isCram: true,
				card: {
					state: State.Review,
					due: now,
					stability: 10,
					difficulty: 5,
					elapsed_days: 10, // Added
					scheduled_days: 10, // Added
					reps: 2, // Added
					lapses: 0, // Added
					last_review: lastReviewDate,
				} as unknown as Card, // Corrected Type Assertion
			} as QuizItem,
		];

		const fsrsRepeatSpy = vi.spyOn(FSRS.prototype, "repeat");

		// Act
		const dueItems = await getDueReviewItems(mockContext, allItems);
		const cramItem = dueItems.find((item) => item.id === "cramCard1");

		if (cramItem) {
			const cramEngine = new FSRS({
				request_retention: mockContext.settings.cramCardRetention,
			});
			const goodSchedule = cramEngine.repeat(cramItem.card, now)[
				Rating.Good
			].card;

			const defaultEngine = new FSRS({ request_retention: 0.9 }); // Default retention
			const goodScheduleDefault = defaultEngine.repeat(
				cramItem.card,
				now,
			)[Rating.Good].card;
			expect(goodSchedule.scheduled_days).toBeLessThan(
				goodScheduleDefault.scheduled_days,
			);
		}

		expect(cramItem).toBeDefined();

		fsrsRepeatSpy.mockRestore();
	});
});
