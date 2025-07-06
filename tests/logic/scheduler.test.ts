import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDueReviewItems } from "../../src/logic/scheduler";
import { PluginContext, Card } from "../../src/types";
import { State } from "../../src/libs/fsrs";

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

		const mockBody = `
This is a due question?srs ^dueCard1
Answer.
?srs(end)

New question 1?srs ^newCard1
Answer.
?srs(end)

New question 2?srs ^newCard2
Answer.
?srs(end)

New question 3?srs ^newCard3
Answer.
?srs(end)
        `;
		const mockSchedules = {
			dueCard1: { state: State.Review, due: yesterday } as Card,
			newCard1: { state: State.New, due: now } as Card,
			newCard2: { state: State.New, due: now } as Card,
			newCard3: { state: State.New, due: now } as Card,
		};

		vi.mocked(processFile).mockResolvedValue({
			body: mockBody,
			schedules: mockSchedules,
		});

		// Act
		const dueItems = await getDueReviewItems(mockContext);
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

		const mockBody = `
Due question?srs ^dueCard1
Answer.
?srs(end)

New question?srs ^newCard1
Answer.
?srs(end)
        `;
		const mockSchedules = {
			dueCard1: { state: State.Review, due: yesterday } as Card,
			newCard1: { state: State.New, due: new Date() } as Card,
		};

		vi.mocked(processFile).mockResolvedValue({
			body: mockBody,
			schedules: mockSchedules,
		});

		// Act
		const dueItems = await getDueReviewItems(mockContext);

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

		const mockBody = `
Q1?srs ^n1
A.
?srs(end)
Q2?srs ^n2
A.
?srs(end)
Q3?srs ^n3
A.
?srs(end)
    `;
		const mockSchedules = {
			n1: { state: State.New, due: new Date() } as Card,
			n2: { state: State.New, due: new Date() } as Card,
			n3: { state: State.New, due: new Date() } as Card,
		};

		vi.mocked(processFile).mockResolvedValue({
			body: mockBody,
			schedules: mockSchedules,
		});
		const randomSpy = vi.spyOn(Math, "random");
		randomSpy.mockReturnValueOnce(0.1).mockReturnValueOnce(0.9);

		// Act
		const dueItems = await getDueReviewItems(mockContext);
		const originalOrder = ["n1", "n2", "n3"];
		const newOrder = dueItems.map((item) => item.id);

		// Assert
		expect(dueItems.length).toBe(3);
		expect(newOrder.length).toBe(3);
		expect(newOrder).not.toEqual(originalOrder);
		expect(newOrder).toEqual(["n3", "n2", "n1"]);

		randomSpy.mockRestore();
	});
});