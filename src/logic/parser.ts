import { App, TFile } from "obsidian";
import { load as parseYaml } from "js-yaml";
import { Card } from "../types";
import {
	FSRS_DATA_CODE_BLOCK_TYPE,
	FSRS_CARD_MARKER,
	FSRS_CARD_END_MARKER,
} from "./consts";

export async function hash(text: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(text);
	const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Parses the raw text content of a file.
 * This is a PURE function, making it easy to test.
 * @param fileContent The raw string content of a note.
 * @returns An object containing the main body and the parsed schedule data.
 */
export function parseContent(fileContent: string): {
	body: string;
	schedules: Record<string, Card>;
} {
	const dataBlockRegex = new RegExp(
		`\n\`\`\`${FSRS_DATA_CODE_BLOCK_TYPE}\\n([\\s\\S]*?)\`\`\``,
	);
	const match = fileContent.match(dataBlockRegex);

	let body = fileContent;
	let schedules: Record<string, Card> = {};

	if (match) {
		body = fileContent.substring(0, match.index);
		try {
			const parsedYaml = parseYaml(match[1]);

			// Safely check if the parsed result is a non-null object
			if (parsedYaml && typeof parsedYaml === "object") {
				schedules = parsedYaml as Record<string, Card>;
			}
		} catch (e) {
			console.error("FSRS: Error parsing schedule YAML", e);
			// On error, schedules remains the default empty object
		}
	}
	return { body, schedules };
}

/**
 * Checks for and adds block IDs to question lines if they are missing.
 * This is a PURE function, making it easy to test.
 * @param body The main text body of a note.
 * @returns An object indicating if a write is needed and the updated body.
 */
export function ensureBlockIds(body: string): {
	needsWrite: boolean;
	updatedBody: string;
} {
	const lines = body.split("\n");
	let needsWrite = false;

	for (let i = 0; i < lines.length; i++) {
		const trimmedLine = lines[i].trim();
		if (
			trimmedLine.includes(FSRS_CARD_MARKER) &&
			trimmedLine !== FSRS_CARD_END_MARKER &&
			!/\^\w+$/.test(trimmedLine)
		) {
			const newId = `${Date.now().toString(36)}${Math.random().toString(36).substring(2, 5)}`;
			lines[i] = `${trimmedLine} ^${newId}`;
			needsWrite = true;
		}
	}

	return {
		needsWrite,
		updatedBody: needsWrite ? lines.join("\n") : body,
	};
}

/**
 * The new orchestrator function that handles file I/O.
 * This function reads a file, calls the pure parsers, and writes back if necessary.
 * Other parts of the plugin should now call this function.
 * @param app The Obsidian App instance.
 * @param noteFile The TFile to process.
 * @returns The final body and schedules after processing.
 */
export async function processFile(
	app: App,
	noteFile: TFile,
): Promise<{ body: string; schedules: Record<string, Card> }> {
	const fileContent = await app.vault.read(noteFile);

	const { body: initialBody, schedules } = parseContent(fileContent);
	const { needsWrite, updatedBody } = ensureBlockIds(initialBody);

	if (needsWrite) {
		const match = fileContent.match(
			new RegExp(
				`\n\`\`\`${FSRS_DATA_CODE_BLOCK_TYPE}\\n([\\s\\S]*?)\`\`\``,
			),
		);
		const finalContent = match ? `${updatedBody}${match[0]}` : updatedBody;
		await app.vault.modify(noteFile, finalContent);
		return { body: updatedBody, schedules };
	}

	return { body: initialBody, schedules };
}
