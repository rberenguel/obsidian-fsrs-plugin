import { PluginContext } from "src/types";
import moment from "moment";

export async function dailyReset(context: PluginContext) {
	const today = moment().format("YYYY-MM-DD");
	if (context.settings.lastReviewDate !== today) {
		context.settings.lastReviewDate = today;
		context.settings.newCardsReviewedToday = 0;
		await context.saveSettings();
	}
}

export async function incrementNewCardCount(
	context: PluginContext,
	count: number = 1,
) {
	await dailyReset(context); // Ensure we're on the correct day
	context.settings.newCardsReviewedToday += count;
	await context.saveSettings();
}
