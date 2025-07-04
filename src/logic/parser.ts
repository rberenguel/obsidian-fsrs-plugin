import { Card } from "../types";
import { TFile, parseYaml } from "obsidian";

import {
	FSRS_DATA_CODE_BLOCK_TYPE,
	FSRS_CARD_MARKER,
	FSRS_CARD_END_MARKER,
} from "./consts";

export async function parseFileContent(noteFile: TFile): Promise<{
	body: string;
	schedules: Record<string, Card>;
}> {
	let fileContent = await this.app.vault.read(noteFile);
	const dataBlockRegex = new RegExp(
		`\n\`\`\`${FSRS_DATA_CODE_BLOCK_TYPE}\\n([\\s\\S]*?)\`\`\``,
	);
	const match = fileContent.match(dataBlockRegex);

	let body = fileContent;
	let schedules: Record<string, Card> = {};

	if (match) {
		body = fileContent.substring(0, match.index);
		try {
			schedules = parseYaml(match[1]) || {};
		} catch (e) {
			console.error(`FSRS: Error parsing YAML in ${noteFile.path}`, e);
		}
	}

	const lines = body.split("\n");
	let needsWrite = false;
	for (let i = 0; i < lines.length; i++) {
		const trimmedLine = lines[i].trim();
		if (
			trimmedLine.includes(FSRS_CARD_MARKER) &&
			trimmedLine !== FSRS_CARD_END_MARKER &&
			!/\^\w+$/.test(trimmedLine)
		) {
			const newId = `${Date.now().toString(36)}${Math.random()
				.toString(36)
				.substring(2, 5)}`;
			lines[i] = `${trimmedLine} ^${newId}`;
			needsWrite = true;
		}
	}

	if (needsWrite) {
		const updatedBody = lines.join("\n");
		const finalContent = match ? `${updatedBody}${match[0]}` : updatedBody;
		await this.app.vault.modify(noteFile, finalContent);
		return { body: updatedBody, schedules };
	}

	return { body, schedules };
}
