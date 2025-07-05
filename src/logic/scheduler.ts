import { TFile } from "obsidian";
import { PluginContext } from "../types";
import { fsrs, createEmptyCard, FSRS } from "../libs/fsrs";
import { FSRS_CARD_MARKER, FSRS_CARD_END_MARKER } from "./consts";
import { FsrsPluginSettings, DEFAULT_SETTINGS, QuizItem, Card } from "../types";
import { dailyReset } from "./state";
import { processFile } from "./parser";

export async function getQuizNotes(context: PluginContext): Promise<TFile[]> {
	const allFiles = context.app.vault.getMarkdownFiles();
	const quizKey = context.settings.quizFrontmatterKey || "quiz";
	return allFiles.filter((file) => {
		const fileCache = context.app.metadataCache.getFileCache(file);
		return fileCache?.frontmatter?.[quizKey] === true;
	});
}

export async function getAllReviewItems(
	context: PluginContext,
): Promise<QuizItem[]> {
	const quizNotes = await getQuizNotes(context);
	const allItems: QuizItem[] = [];
	const now = new Date();

	for (const noteFile of quizNotes) {
		const { body, schedules } = await processFile(context.app, noteFile);

		const lines = body.split("\n");
		let currentQuestion = "";
		let currentAnswer = "";
		let currentBlockId = "";
		let inAnswer = false;

		for (const line of lines) {
			const srsMarkerIndex = line.indexOf(FSRS_CARD_MARKER);

			if (srsMarkerIndex !== -1) {
				if (currentQuestion && currentBlockId) {
					const card =
						schedules[currentBlockId] ||
						(createEmptyCard(now) as Card);
					allItems.push({
						file: noteFile,
						id: currentBlockId,
						card,
						isCloze: false,
						question: currentQuestion.trim(),
						answer: currentAnswer.trim(),
					});
				}

				currentQuestion = line.substring(0, srsMarkerIndex);
				const blockIdMatch = line.match(/\^([a-zA-Z0-9]+)$/);
				currentBlockId = blockIdMatch ? blockIdMatch[1].trim() : "";
				currentAnswer = "";
				inAnswer = true;
			} else if (inAnswer) {
				if (line.trim() === FSRS_CARD_END_MARKER) {
					if (currentQuestion && currentBlockId) {
						const card =
							schedules[currentBlockId] ||
							(createEmptyCard(now) as Card);
						allItems.push({
							file: noteFile,
							id: currentBlockId,
							card,
							isCloze: false,
							question: currentQuestion.trim(),
							answer: currentAnswer.trim(),
						});
					}
					currentQuestion = "";
					currentAnswer = "";
					currentBlockId = "";
					inAnswer = false;
				} else {
					currentAnswer += line + "\n";
				}
			}
		}

		if (currentQuestion && currentBlockId) {
			const card =
				schedules[currentBlockId] || (createEmptyCard(now) as Card);
			allItems.push({
				file: noteFile,
				id: currentBlockId,
				card,
				isCloze: false,
				question: currentQuestion.trim(),
				answer: currentAnswer.trim(),
			});
		}

		// Cloze card parsing remains unchanged
		const clozeRegex = /\{\{([a-zA-Z0-9_-]+)::((?:.|\n)*?)\}\}/g;
		let match;
		while ((match = clozeRegex.exec(body)) !== null) {
			const clozeId = match[1];
			const clozeContent = match[2];
			const card = schedules[clozeId] || (createEmptyCard(now) as Card);
			allItems.push({
				file: noteFile,
				id: clozeId,
				card,
				isCloze: true,
				question: body,
				answer: clozeContent,
				rawQuestionText: body,
			});
		}
	}
	return allItems;
}

export async function getDueReviewItems(
	context: PluginContext,
): Promise<QuizItem[]> {
	await dailyReset(context);

	const allItems = await getAllReviewItems(context);
	const now = new Date();

	const dueReviews: QuizItem[] = [];
	const allNewCards: QuizItem[] = [];

	// Partition all items into either new or scheduled
	for (const item of allItems) {
		// A card is considered new if its state is literally "new" or if it has no state property.
		if (item.card.state === "new" || !item.card.state) {
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
	if (context.settings.shuffleNewCards) {
		for (let i = allNewCards.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[allNewCards[i], allNewCards[j]] = [allNewCards[j], allNewCards[i]];
		}
	}
	// Determine how many new cards can be shown today
	const newCardsAvailable =
		context.settings.maxNewCardsPerDay -
		context.settings.newCardsReviewedToday;
	const newCardsForSession =
		newCardsAvailable > 0 ? allNewCards.slice(0, newCardsAvailable) : [];

	// The final queue is all due reviews plus the capped number of new cards
	return [...dueReviews, ...newCardsForSession];
}

export async function getReviewItemsForDay(
	context: PluginContext,
	day: moment.Moment,
): Promise<QuizItem[]> {
	const allItems = await getAllReviewItems(context);
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
			day.isSame(window.moment().startOf("day")) &&
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
