import { describe, it, expect, vi } from "vitest";
import moment from "moment";
import { dailyReset, incrementNewCardCount } from "../../src/logic/state";
import { PluginContext } from "../../src/types";

describe("dailyReset", () => {
	it("should reset the new card count and save settings on a new day", async () => {
		// Arrange
		const mockContext = {
			settings: {
				lastReviewDate: "2025-07-03", // Yesterday
				newCardsReviewedToday: 15,
			},
			saveSettings: vi.fn(), // Create a mock function
		} as unknown as PluginContext;

		// Act
		await dailyReset(mockContext);

		// Assert
		expect(mockContext.settings.newCardsReviewedToday).toBe(0);
		expect(mockContext.settings.lastReviewDate).toBe(
			moment().format("YYYY-MM-DD"),
		);
		expect(mockContext.saveSettings).toHaveBeenCalledOnce();
	});

	it("should not do anything if it is the same day", async () => {
		// Arrange
		const todayStr = moment().format("YYYY-MM-DD");
		const mockContext = {
			settings: {
				lastReviewDate: todayStr,
				newCardsReviewedToday: 15,
			},
			saveSettings: vi.fn(),
		} as unknown as PluginContext;

		// Act
		await dailyReset(mockContext);

		// Assert
		expect(mockContext.settings.newCardsReviewedToday).toBe(15); // Unchanged
		expect(mockContext.saveSettings).not.toHaveBeenCalled();
	});
});

describe("incrementNewCardCount", () => {
	it("should increment the count and save settings", async () => {
		// Arrange
		const todayStr = moment().format("YYYY-MM-DD");
		const mockContext = {
			settings: {
				lastReviewDate: todayStr,
				newCardsReviewedToday: 5,
			},
			saveSettings: vi.fn(),
		} as unknown as PluginContext;

		// Act
		await incrementNewCardCount(mockContext);

		// Assert
		expect(mockContext.settings.newCardsReviewedToday).toBe(6);
		expect(mockContext.saveSettings).toHaveBeenCalledOnce();
	});

	it("should reset the count before incrementing if it is a new day", async () => {
		// Arrange
		const mockContext = {
			settings: {
				lastReviewDate: "2025-07-03", // Yesterday
				newCardsReviewedToday: 10,
			},
			saveSettings: vi.fn(),
		} as unknown as PluginContext;

		// Act
		// incrementNewCardCount calls dailyReset internally
		await incrementNewCardCount(mockContext, 2);

		// Assert
		// It resets to 0, then increments by 2
		expect(mockContext.settings.newCardsReviewedToday).toBe(2);
		// saveSettings is called once by dailyReset, and once by incrementNewCardCount
		expect(mockContext.saveSettings).toHaveBeenCalledTimes(2);
	});
});
