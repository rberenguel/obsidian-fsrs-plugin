### Implementation Plan: Suspend and Bury Card Functionality

This plan outlines the steps to add "suspend" and "bury" features to the `simple-fsrs` Obsidian plugin, allowing users to temporarily or indefinitely hide cards from their review queue.

#### 1. Update Card Data Structure (`src/types.ts`)

- **Modify `Card` Interface:** Add two optional properties to the `Card` interface to store the suspend/bury status.
    - `suspended?: boolean;` (true if the card is suspended, false or undefined otherwise)
    - `buriedUntil?: string;` (ISO 8601 date string if the card is buried, indicating when it should reappear; undefined otherwise)

#### 2. Modify Quiz Modal (UI & Interaction - `src/ui/QuizModal.ts`)

- **Add Suspend/Bury Buttons:** In the `displayAnswer()` method, add two new buttons alongside the existing rating buttons: "Suspend" and "Bury".
    - These buttons will trigger new methods: `handleSuspend()` and `handleBury()`.
- **Implement `handleSuspend()` Method:**
    - This method will set `this.currentItem.card.suspended = true;`.
    - It will then call `this.plugin.updateCardDataInNote()` to persist this change to the note's `srs-data` block.
    - After updating, it should close the current quiz modal and proceed to the next card in the queue (similar to how rating works).
    - Provide a `Notice` to the user confirming the card has been suspended.
- **Implement `handleBury()` Method:**
    - This method will calculate a `buriedUntil` date (e.g., end of the current day or 24 hours from now).
    - It will set `this.currentItem.card.buriedUntil = calculatedDate.toISOString();`.
    - It will then call `this.plugin.updateCardDataInNote()` to persist this change.
    - After updating, it should close the current quiz modal and proceed to the next card.
    - Provide a `Notice` to the user confirming the card has been buried.
- **Update `onClose()`:** Ensure that any event listeners added for the suspend/bury buttons are properly removed.

#### 3. Update Scheduler Logic (`src/logic/scheduler.ts`)

- **Modify `getAllReviewItems()`:**
    - When fetching all quiz items, ensure that the `suspended` and `buriedUntil` properties are correctly parsed from the `srs-data` YAML block and assigned to the `QuizItem.card` object.
- **Modify `getDueReviewItems()`:**
    - **Filter Suspended Cards:** Add a filter condition to exclude any `QuizItem` where `quizItem.card.suspended === true`.
    - **Filter Buried Cards:** Add another filter condition to exclude any `QuizItem` where `quizItem.card.buriedUntil` exists and `new Date(quizItem.card.buriedUntil) > new Date()`. This ensures buried cards only reappear after their `buriedUntil` timestamp.

#### 4. (Optional) Add Unsuspend/Unbury Functionality

- **Consider `QuestionBrowserModal`:** The `QuestionBrowserModal` could be enhanced to show suspended/buried cards and provide options to "unsuspend" or "unbury" them. This would involve:
    - Adding UI elements (e.g., buttons, context menu items) to trigger these actions.
    - Implementing methods to set `card.suspended = false` or `card.buriedUntil = undefined` and persist the changes.
- **New Commands:** Alternatively, dedicated commands could be added to unsuspend/unbury the currently active card in the editor.

This plan focuses on the core implementation of suspending and burying cards from the quiz modal and ensuring they are correctly filtered from review sessions.
