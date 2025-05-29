export interface FsrsPluginSettings {
    quizFrontmatterKey: string;
    quizMarker: string;
    ratingAgainKey: string;
    ratingHardKey: string;
    ratingGoodKey: string;
    ratingEasyKey: string;
}

export const DEFAULT_SETTINGS: FsrsPluginSettings = {
    quizFrontmatterKey: "quiz",
    quizMarker: "%%quiz%%",
    ratingAgainKey: "a",
    ratingHardKey: "r",
    ratingGoodKey: "s",
    ratingEasyKey: "t",
};