import { describe, it, expect, vi } from "vitest";
// No 'obsidian' import needed!
import {
	parseContent,
	ensureBlockIds,
	processFile,
} from "../../src/logic/parser";

describe("parseContent", () => {
	it("should separate the body from a valid FSRS data block", () => {
		const mockDataBlock =
			"\n```srs-data\ncard1:\n    due: 2025-07-05T10:00:00.000Z\n    stability: 2.5\n```";
		const mockBody = "This is the main content of the note.";
		const fileContent = `${mockBody}${mockDataBlock}`;

		const { body, schedules } = parseContent(fileContent);

		expect(body).toBe(mockBody);
		expect(schedules).toHaveProperty("card1");
		expect(schedules.card1.stability).toBe(2.5);
	});

	it("should handle content with no data block", () => {
		const fileContent = "Just a simple note with no data.";

		const { body, schedules } = parseContent(fileContent);

		expect(body).toBe(fileContent);
		expect(schedules).toEqual({});
	});
});

describe("ensureBlockIds", () => {
	it("should add a block ID to a question line that is missing one", () => {
		const bodyWithMissingId = "This is a question?srs";

		const { needsWrite, updatedBody } = ensureBlockIds(bodyWithMissingId);

		expect(needsWrite).toBe(true);
		expect(updatedBody).toMatch(/\?srs \^[a-zA-Z0-9]+$/);
	});

	it("should not change a line that already has a block ID", () => {
		const bodyWithId = "This is a question?srs ^existingId";

		const { needsWrite, updatedBody } = ensureBlockIds(bodyWithId);

		expect(needsWrite).toBe(false);
		expect(updatedBody).toBe(bodyWithId);
	});
});

// This is an integration test for the function that interacts with the framework.
// We use `as any` to create mocks that conform to the types without needing to import them.
describe("processFile", () => {
	it("should read a file and write back if block IDs are missing", async () => {
		const mockContent = "A question needing an ID?srs";
		const mockApp = {
			vault: {
				read: vi.fn().mockResolvedValue(mockContent),
				modify: vi.fn().mockResolvedValue(undefined),
			},
		} as any; // Cast to 'any' to avoid needing the 'App' type
		const mockFile = {} as any; // Cast to 'any' to avoid needing the 'TFile' type

		const { body } = await processFile(mockApp, mockFile);

		expect(mockApp.vault.read).toHaveBeenCalledWith(mockFile);
		expect(mockApp.vault.modify).toHaveBeenCalledOnce();
		expect(body).toMatch(/\?srs \^[a-zA-Z0-9]+$/);
	});

	it("should not write back to the file if no changes are needed", async () => {
		const mockContent = "A question with an ID?srs ^perfect";
		const mockApp = {
			vault: {
				read: vi.fn().mockResolvedValue(mockContent),
				modify: vi.fn().mockResolvedValue(undefined),
			},
		} as any;
		const mockFile = {} as any;

		await processFile(mockApp, mockFile);

		expect(mockApp.vault.modify).not.toHaveBeenCalled();
	});
});
