# Obsidian FSRS Quiz Plugin: Project Summary

## 1. Goal of the Project

* To create an Obsidian plugin that enables users to practice spaced repetition learning using their notes.
* To implement the FSRS (Free Spaced Repetition Scheduler) algorithm for scheduling reviews.
* To allow users to easily create flashcards from content within their Obsidian notes and review them efficiently.
* To support both traditional "Question --- Answer" style notes and inline cloze deletions (e.g., `{{id:answer}}`) for creating flashcards.
* To provide a good user experience by visually distinguishing cloze deletions in both reading and live preview modes and allowing for easy editing.

## 2. How the Plugin Works

* **Note Identification for Quizzing:**
    * Notes are marked as "quiz notes" if they contain a specific YAML frontmatter key (default: `quiz`) set to `true`. This key is configurable.
* **Flashcard Formats:**
    * **Traditional:** Content before the first `---` in the note body is the question; content after is the answer.
    * **Cloze Deletion:** Text can contain inline patterns like `{{id:content}}`. Each pattern can become a separate flashcard where "content" is the answer, and the surrounding text (with the active cloze replaced by ` [...] ` and other clozes rendered as their content) forms the question.
* **FSRS Data Storage:**
    * Scheduling data (due date, stability, difficulty, etc.) is stored in a JSON code block at the end of the note, separated by `---`.
    * For simple Q/A notes, this is a single JSON object for the card.
    * For notes with cloze deletions, this is a JSON map where keys are the cloze identifiers (e.g., "q1") and values are the card objects for each cloze.
* **Core Functionality (`main.ts`, `QuizModal.ts`, `FsrsSettingsTab.ts`):**
    * **Settings:** Allow configuration of frontmatter key, hotkeys for rating ("Again", "Hard", "Good", "Easy").
    * **Quiz Session:**
        * A ribbon icon ("brain") or command starts a quiz session.
        * It identifies notes with the quiz frontmatter and FSRS items that are currently due.
        * Presents one question at a time in a modal (`QuizModal`).
    * **Quiz Modal:**
        * Displays the question (with the active cloze replaced by ` [...] ` and other clozes rendered as their content, or the main question for simple notes).
        * Reveals the answer (active cloze content or main answer) on click or spacebar.
        * Provides rating buttons which update the card's FSRS data using `fsrsInstance.repeat()` and save it back to the note.
* **Cloze Rendering:**
    * **Reading View:** A `MarkdownPostProcessor` finds `{{id:content}}` in quiz notes and replaces it with a styled "capsule" showing only "content" (e.g., "❓ content").
    * **Live Preview:** A CodeMirror 6 `ViewPlugin` with `Decorations` achieves the same visual transformation, replacing `{{id:content}}` with a widget displaying the styled "capsule". This rendering reverts to raw text when the cursor is inside the cloze for editing.
    * **Quiz Modal Question Display:** Non-active cloze placeholders in the question are also rendered as their content (currently as plain text, aiming for styled capsules).

## 3. What We Have Been Doing (Iterative Process Highlights)

1.  **Foundation & FSRS Core:** Initial setup, FSRS JavaScript library integration, basic Q/A parsing, and storing FSRS data in notes.
2.  **TypeScript & Structure:** Refactoring into TypeScript with separate modules for plugin logic, quiz modal, and settings.
3.  **UI/UX:** Implemented Markdown rendering for Q/A in the modal, configurable hotkeys, ribbon icon, and commands.
4.  **Frontmatter & Note Management:** Switched to frontmatter for quiz note identification, refined note content parsing (`parseNoteContent`) and FSRS data writing (`writeFsrsDataToNote`) to correctly handle frontmatter and the FSRS JSON block, fixing data corruption issues.
5.  **Cloze Deletion Feature - Phase 1 (Logic):**
    * Modified `parseNoteContent` to identify `{{id:content}}` patterns.
    * Adapted `startQuizSession` to differentiate between simple Q/A notes and cloze notes, preparing `QuizItem` data accordingly. For cloze notes, it now expects/works with a map of FSRS cards in the JSON block.
    * Updated `QuizModal` to accept `QuizItem`, display the correct question/answer for either type (rendering only the active cloze as ` [...] `), and handle saving data back to either a single FSRS object or the map of FSRS objects for clozes.
    * Refined quiz session logic to only pick strictly due items.
6.  **Cloze Deletion Feature - Phase 2 (Rendering):**
    * Implemented a `MarkdownPostProcessor` to render `{{id:content}}` as styled "content" (capsule with icon) in Reading View for quiz notes only.
    * Implemented a CodeMirror 6 `ViewPlugin` with `Decorations` to achieve the same styled rendering in Live Preview for quiz notes, which also reverts to raw text when the cursor enters the cloze for editing.
    * Currently refining how non-active clozes are displayed within the Quiz Modal's question area to match this styled rendering.