# Refactoring Plan

## Goal

The plugin has grown in complexity, and the `main.ts` file is currently handling too many different responsibilities (plugin startup, state management, parsing, scheduling, UI decoration). The goal of this refactoring is to separate these concerns into different, focused files. This will make the codebase cleaner, easier to maintain, and simpler to extend in the future, following the Single Responsibility Principle.

---

## Proposed File Structure

The plan is to organize the code into logical directories:

### 1. `main.ts` (The Lean Entry Point)

The `main.ts` file will be significantly slimmed down. Its only responsibility will be to initialize the plugin by:
-   Importing functionality from the new modules.
-   Registering commands, settings tabs, views, and editor extensions.
-   Wiring all the different components together.

### 2. `ui/` Directory (User Interface Components)

This new directory will contain everything related to what the user sees and interacts with.
-   `ui/QuizModal.ts` (Existing)
-   `ui/CalendarView.ts` (Existing)
-   `ui/FsrsSettingsTab.ts` (Existing)
-   `ui/decorations.ts` **(New)**: This file will contain all the CodeMirror editor styling logic, including the `ViewPlugin` builder functions (for capsules and line shading) and their `Widget` classes.

### 3. `logic/` Directory (Core Business Logic)

This new directory will contain the "brains" of the plugin.
-   `logic/scheduler.ts` **(New)**: Will handle the core logic of determining which cards to review. It will contain functions like `getDueReviewItems()` and `getAllReviewItems()`.
-   `logic/state.ts` **(New)**: Will be responsible for managing the persistent state for the new card queue, containing functions like `dailyReset()` and `incrementNewCardCount()`.
-   `logic/parser.ts` **(New)**: Will hold lower-level functions that read and interpret the content of a note file, such as `parseFileContent()`.

### 4. `types.ts` (Centralized Type Definitions)

A new `types.ts` file will be created to consolidate all shared TypeScript interfaces. This provides a single source of truth for the data structures used throughout the plugin.
-   `FsrsPluginSettings`
-   `Card`
-   `QuizItem`

---

## Benefits of This Approach

-   **Clarity**: It will be easy to know exactly where to look when changing a specific piece of functionality.
-   **Maintainability**: Smaller, focused files are much simpler to debug and manage.
-   **Scalability**: Adding new features will be a cleaner process, often involving a new, self-contained file rather than increasing the complexity of existing ones.