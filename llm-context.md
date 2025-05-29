# Obsidian FSRS Quiz Plugin: Project Summary

## 1. Goal of the Project

* To create an Obsidian plugin that enables users to practice spaced repetition learning using their notes.
* To implement the FSRS (Free Spaced Repetition Scheduler) algorithm for scheduling reviews.
* To allow users to easily create flashcards from content within their Obsidian notes and review them efficiently.

## 2. How the Plugin Works (Based on Provided Files)

* **Note Identification for Quizzing:**
    * Notes are identified as "quiz notes" if they contain a specific YAML frontmatter key set to `true` (e.g., `quiz: true`).
    * The exact frontmatter key is configurable in the plugin's settings (defaulting to "quiz").
    * A setting also exists for a hidden comment marker (e.g., `%%quiz%%`), though the `getQuizNotes` function in `main.ts` currently uses the frontmatter key.

* **Flashcard Format in Notes:**
    * **Question & Answer Separation:** Inside a quiz note, the question and answer are separated by a Markdown horizontal rule (`---`). The content before the first `---` (in the note body, after any frontmatter) is the question, and the content after it is the answer.
    * **Frontmatter Handling:** YAML frontmatter is not displayed as part of the question in the quiz modal; only the note's body content is used.
    * **Markdown Rendering:** Both questions and answers are rendered from Markdown to HTML for display in the quiz modal.

* **FSRS Data Storage:**
    * FSRS scheduling data (e.g., due date, stability, difficulty) for each quiz note is stored directly within that note.
    * This data is formatted as a JSON object inside a Markdown code block (e.g., ```json ... ```).
    * This JSON block is placed at the end of the note, separated from the answer content by an additional `---` (with preceding blank lines).

* **Core Plugin Functionality:**
    * **Settings Tab (`FsrsSettingsTab.ts`):** Allows users to configure:
        * The frontmatter key for quiz notes.
        * The hidden comment marker.
        * Customizable single-character hotkeys for rating answers ("Again", "Hard", "Good", "Easy"), defaulting to 'a', 'r', 's', 't'.
    * **Main Plugin Logic (`main.ts` - `FsrsPlugin` class):**
        * Initializes settings and the FSRS engine instance (`this.fsrsInstance`).
        * Adds a ribbon icon ("brain") and a command to "Start FSRS Quiz Review."
        * Adds a command to "Mark note as quiz" by setting the configured frontmatter key. This command has a default hotkey (Alt+Q).
        * `parseNoteContent()`: Extracts Question, Answer, and FSRS data from a note's body, correctly handling the FSRS JSON block at the end.
        * `writeFsrsDataToNote()`: Reconstructs the note content, preserving frontmatter and updating the FSRS JSON block.
        * `startQuizSession()`: Finds due/new notes and launches the `QuizModal`.
        * `mapIntToRating()`: Converts numeric rating input to the `Rating` enum value (this was recently updated to be consistent). The version in `main.ts` is called by `QuizModal`.
    * **Quiz Modal (`QuizModal.ts`):**
        * Receives `app`, `plugin` instance, `noteFile` (TFile), and `card` (FSRS card object) in its constructor.
        * `onOpen()`: Separates frontmatter from the note body, parses the body for Q/A, and displays the rendered Markdown question.
        * Answer Reveal: The answer is revealed by clicking the question area or pressing the `Space` key.
        * Answer Display: The answer is shown as rendered Markdown, in a container styled similarly to the question.
        * Rating:
            * Presents "Again", "Hard", "Good", "Easy" buttons, styled with Solarized colors. Their labels include the currently configured (or default) hotkey.
            * Rating can be done by clicking buttons or using the configured keyboard shortcuts (checked via `this.plugin.settings`).
            * `handleRatingByValue()` updates the card's FSRS data using `this.plugin.fsrsInstance.repeat()` and saves it back to the note via `this.plugin.writeFsrsDataToNote()`, passing the original frontmatter and body.
        * The `QuizModal` uses its own defined `enum Rating` and `interface Card` for type safety.

## 3. What We Have Been Doing (Iterative Process)

1.  **Initial Concept & Foundation:**
    * User proposed creating an FSRS plugin for Obsidian, providing an initial JavaScript FSRS implementation (`quiz.js`) and a simple JS plugin template).
    * Defined basic Q/A format (`---` separator) and FSRS data storage (JSON in note).

2.  **Transition to TypeScript & Refactoring:**
    * Acknowledged limitations of plain JS for modules and adopted a TypeScript-based structure, likely based on the official Obsidian sample plugin.
    * Refactored the initial single `main.ts` into separate files: `main.ts` (for `FsrsPlugin`), `QuizModal.ts`, and `FsrsSettingsTab.ts`, plus a `settings.ts` for type definitions.

3.  **Core Logic Implementation & Refinement:**
    * **Note Parsing (`parseNoteContent`):** Iteratively refined to correctly separate Question/Answer from the FSRS JSON block and handle cases with missing/malformed FSRS blocks.
    * **Frontmatter Handling:** Implemented logic in `QuizModal.onOpen` to separate frontmatter from the note body for Q/A display. Updated `writeFsrsDataToNote` in `FsrsPlugin` to correctly preserve frontmatter when saving, fixing a data corruption bug.
    * **FSRS Integration:** Ensured `fsrsInstance` is accessible to `QuizModal` (by making it a public member of `FsrsPlugin` initialized in `onload`).
    * **Type Safety:** Added explicit type annotations for constructor arguments and properties in `QuizModal`. Defined `interface Card` and `enum Rating` locally within `QuizModal.ts` for type safety with the JavaScript FSRS library. Addressed type-checking errors related to `isNaN` usage with Dates and module exports/imports during refactoring. Corrected argument mismatches in function calls between `QuizModal` and `FsrsPlugin`.

4.  **User Interface & Experience Enhancements:**
    * **Markdown Rendering:** Modified `QuizModal` to use `MarkdownRenderer` for displaying questions and answers.
    * **Modal Layout & Styling:** Adjusted `QuizModal` for better spacing and consistent structure for question and answer display.
    * **Button Styling:** Discussed styling for rating buttons (Solarized colors).
    * **Keyboard Controls:**
        * Implemented `Space` key to show answers.
        * Added keyboard shortcuts (`a`, `r`, `s`, `t` by default) for rating buttons, making these configurable via the settings tab.
        * Ensured button labels in `QuizModal` dynamically reflect the configured hotkeys.
    * **Ribbon Icon:** Changed the "Start Quiz Review" ribbon icon to "brain".
    * **Command Hotkeys:** Defined default hotkeys for plugin commands (e.g., for starting a review and marking a note as a quiz).

5.  **Note Identification & Configuration:**
    * Switched from tags to using a YAML frontmatter key as the primary method for identifying quiz notes.
    * Implemented a settings tab (`FsrsSettingsTab.ts`) allowing user configuration of the frontmatter key, a hidden comment marker, and rating hotkeys.
    * Added a command to easily set the `quiz: true` (or configured key) frontmatter on the active note.

6.  **Consistency and Bug Fixing:**
    * Addressed inconsistencies in `mapIntToRating` usage, opting to use the method within `QuizModal` directly by changing its call signature in `handleRatingByValue`, and removing the redundant one from `FsrsPlugin`.
    * Corrected argument lists in function calls (e.g., for `writeFsrsDataToNote`).
    * Improved error handling notifications in `QuizModal`.

This iterative process has built a fairly comprehensive and configurable FSRS quiz plugin.