import { TFile } from "obsidian";
import { PluginContext } from "../types";
import { fsrs, createEmptyCard, FSRS, State } from "../libs/fsrs";
import {
	FSRS_CARD_MARKER,
	FSRS_CARD_END_MARKER,
	FSRS_CRAM_CARD_MARKER,
} from "./consts";
import { FsrsPluginSettings, DEFAULT_SETTINGS, QuizItem, Card } from "../types";
import { dailyReset } from "./state";
import { processFile } from "./parser";
import { hash } from "./parser";

export async function getQuizNotes(context: PluginContext): Promise<TFile[]> {
	const allFiles = context.app.vault.getMarkdownFiles();
	return allFiles.filter((file) => {
		const fileCache = context.app.metadataCache.getFileCache(file);
		return fileCache?.frontmatter?.hasOwnProperty("fsrs");
	});
}

export async function getAllReviewItems(
	context: PluginContext,
	files?: TFile[],
): Promise<QuizItem[]> {
	const quizNotes = files || (await getQuizNotes(context));
	const allItems: QuizItem[] = [];
	const now = new Date();

	const questionMarkerRegex = new RegExp(
		`\\s+(\\?srs(?:\\(cram\\))?)\\s*(\\^\\w+)?$`,
	);

	for (const noteFile of quizNotes) {
		const { body, schedules } = await processFile(context.app, noteFile);
		const lines = body.split("\n");
		let currentQandA: {
			question: string;
			answer: string;
			blockId: string;
			isCram: boolean;
		} | null = null;

		const saveCurrentQandA = () => {
			if (currentQandA) {
				const card =
					schedules[currentQandA.blockId] ||
					(createEmptyCard(now) as Card);
				allItems.push({
					file: noteFile,
					id: currentQandA.blockId,
					card,
					isCloze: false,
					question: currentQandA.question.trim(),
					answer: currentQandA.answer.trim(),
					blockId: currentQandA.blockId,
					isCram: currentQandA.isCram,
				});
				currentQandA = null;
			}
		};

		for (const line of lines) {
			const srsMarkerIndex = line.indexOf(FSRS_CARD_MARKER);
			const isClozeLine = line.includes("::");

			if (srsMarkerIndex !== -1) {
				const markerMatch = line.match(questionMarkerRegex);
				// This line is a question. End any previous Q&A card.
				saveCurrentQandA();

				const blockIdMatch = line.match(/\^([a-zA-Z0-9]+)$/);
				const blockId = blockIdMatch
					? blockIdMatch[1].trim()
					: undefined;
				let isCram = false;
				if (markerMatch && markerMatch.length > 0) {
					isCram = markerMatch[1] === FSRS_CRAM_CARD_MARKER;
				}
				if (isClozeLine && blockId) {
					// This is a cloze deletion line.
					const clozeRegex = /::((?:.|\n)*?)::/g;
					let match;
					while ((match = clozeRegex.exec(line)) !== null) {
						const clozeContent = match[1];
						const clozeId = await hash(clozeContent);
						const card =
							schedules[clozeId] ||
							(createEmptyCard(now) as Card);
						allItems.push({
							file: noteFile,
							id: clozeId,
							card,
							isCloze: true,
							question: line, // The question is the line itself
							answer: clozeContent,
							rawQuestionText: line,
							blockId: blockId,
							isCram: false,
						});
					}
				} else if (blockId) {
					// This is a new Q&A question.
					currentQandA = {
						question: line.substring(0, srsMarkerIndex),
						answer: "",
						blockId: blockId,
						isCram: isCram,
					};
				}
			} else if (line.trim() === FSRS_CARD_END_MARKER) {
				saveCurrentQandA();
			} else if (currentQandA) {
				// This is part of an answer for a Q&A card.
				currentQandA.answer += line + "\n";
			}
		}
		// Save any lingering Q&A card at the end of the file.
		saveCurrentQandA();
	}
	return allItems;
}

export async function getDueReviewItems(
	context: PluginContext,
	allItems: QuizItem[],
): Promise<QuizItem[]> {
	await dailyReset(context);

	const now = new Date();

	const dueReviews: QuizItem[] = [];
	const allNewCards: QuizItem[] = [];

	// Partition all items into either new or scheduled
	for (const item of allItems) {
		// A card is considered new if its state is literally "new" or if it has no state property.
		if (
			item.card.state === "new" ||
			!item.card.state ||
			item.card.state === State.New
		) {
			allNewCards.push(item);
		} else {
			// It's a scheduled card, so check if it's due.
			const dueDate =
				typeof item.card.due === "string"
					? new Date(item.card.due)
					: item.card.due;
			if (
				dueDate instanceof Date &&
				!isNaN(dueDate.getTime()) &&
				dueDate <= now
			) {
				dueReviews.push(item);
			}
		}
	}
	const cramNewCards = allNewCards.filter((item) => item.isCram);
	const regularNewCards = allNewCards.filter((item) => !item.isCram);

	const prioritizedNewCards = [...cramNewCards, ...regularNewCards];

	// Determine how many new cards can be shown today
	const newCardsAvailable =
		context.settings.maxNewCardsPerDay -
		context.settings.newCardsReviewedToday;

	let newCardsForSession =
		newCardsAvailable > 0
			? prioritizedNewCards.slice(0, newCardsAvailable)
			: [];

	// Shuffle the final list of new cards for the session if enabled
	if (context.settings.shuffleNewCards) {
		for (let i = newCardsForSession.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[newCardsForSession[i], newCardsForSession[j]] = [
				newCardsForSession[j],
				newCardsForSession[i],
			];
		}
	}
	return [...dueReviews, ...newCardsForSession];
}

export async function getReviewItemsForDay(
	context: PluginContext,
	day: moment.Moment,
	allItems: QuizItem[],
): Promise<QuizItem[]> {
	const dayStart = day.clone().startOf("day");
	const itemsForDay: QuizItem[] = [];

	// Only include cards in a review state
	const scheduledItems = allItems.filter(
		(item) => item.card.state && item.card.state !== "new",
	);

	for (const item of scheduledItems) {
		const dueDate = window.moment(item.card.due);
		if (!dueDate.isValid()) continue;

		// For today, include anything that is overdue
		if (
			dayStart.isSame(window.moment().startOf("day")) &&
			dueDate.isSameOrBefore(day)
		) {
			itemsForDay.push(item);
		}
		// For other days, only include cards scheduled exactly for that day
		else if (dueDate.isSame(dayStart, "day")) {
			itemsForDay.push(item);
		}
	}
	return itemsForDay;
}
