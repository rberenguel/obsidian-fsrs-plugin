import { App, TFile } from "obsidian";

// WARNING: Keep this interface and ignore anything related to Card inside the fsrs library.
export interface Card {
	due: Date;
	stability: number;
	difficulty: number;
	elapsed_days: number;
	scheduled_days: number;
	reps: number;
	lapses: number;
	// WARNING: This type is misleading. The fsrs.js library uses a numeric
	// enum for state (0: New, 1: Learning, etc.), not a string.
	// Logic elsewhere relies on this numeric value. Avoid changing this
	// interface and be cautious when handling this property.
	state: "new" | "learning" | "review" | "relearning";
}

export interface QuizItem {
	file: TFile;
	card: Card;
	id: string;
	isCloze: boolean;
	question: string;
	answer: string;
	rawQuestionText?: string;
}

export interface FsrsPluginSettings {
	fsrsFrontmatterKey: string;
	quizMarker: string;
	ratingAgainKey: string;
	ratingHardKey: string;
	ratingGoodKey: string;
	ratingEasyKey: string;
	maxNewCardsPerDay: number;
	lastReviewDate: string;
	newCardsReviewedToday: number;
	shuffleNewCards: boolean;
}

export const DEFAULT_SETTINGS: FsrsPluginSettings = {
	fsrsFrontmatterKey: "fsrs",
	quizMarker: "%%quiz%%",
	ratingAgainKey: "a",
	ratingHardKey: "r",
	ratingGoodKey: "s",
	ratingEasyKey: "t",
	maxNewCardsPerDay: 20,
	lastReviewDate: "",
	newCardsReviewedToday: 0,
	shuffleNewCards: false,
};

export interface PluginContext {
	app: App;
	settings: FsrsPluginSettings;
	saveSettings: () => Promise<void>;
}
