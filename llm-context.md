# Plan for Pruning Orphaned Card Schedules

## 1. Goal

To automatically and efficiently remove schedule data from the `srs-data` code block when the corresponding card (Q&A or cloze) has been deleted from the note's body.

## 2. Core Principle

The note's body is the single source of truth. If a card ID (block reference or cloze hash) doesn't exist in the body, its corresponding schedule entry is considered an orphan and should be deleted.

## 3. Proposed Implementation Strategy

The most efficient and user-transparent way to handle this is to piggyback the pruning process onto an existing file-write operation. The `updateCardDataInNote` function in `main.ts` is the ideal candidate, as it's already triggered every time a card is reviewed and its schedule needs to be saved.

### Step 1: Create a Helper Function to Get All Valid Card IDs

We will create a new, lightweight helper function, likely in `src/logic/scheduler.ts`, called `getAllCardIdsInFile`.

- **Input**: `body: string` (the text content of the note).
- **Logic**: This function will reuse the parsing logic from `getAllReviewItems` but will be optimized to only extract IDs.
    - It will find all Q&A block IDs (`^...`).
    - It will find all cloze deletions (`::...::`), hash their content to get their IDs.
- **Output**: `Promise<Set<string>>` - A Set containing every valid card ID currently present in the note. Using a Set provides fast lookups.

### Step 2: Modify `updateCardDataInNote` in `main.ts`

This function will be augmented to perform the cleanup before it writes the updated schedule.

The new sequence of operations will be:

1.  **Read File**: Read the entire current content of the note file.
2.  **Get All Valid IDs**: Call the new `getAllCardIdsInFile` helper function with the note's body to get a `Set` of all valid card IDs.
3.  **Parse Existing Schedules**: Parse the `srs-data` block from the file content to get the current `schedules` object.
4.  **Filter and Prune**:
    - Create a new `prunedSchedules` object.
    - Iterate through the keys (card IDs) of the `schedules` object.
    - If a card ID from the `schedules` object exists in the `validCardIds` Set, copy that key-value pair to `prunedSchedules`.
5.  **Update the Current Card**: Add the `updatedCard` data to the `prunedSchedules` object using its ID. This ensures the card just reviewed is always preserved.
6.  **Write Back**: Serialize the clean `prunedSchedules` object to YAML and write it back to the file, replacing the old `srs-data` block.

## 4. Why This Approach?

- **Efficiency**: It avoids adding extra file read/write cycles by integrating the cleanup into an existing I/O operation. The plugin only writes to the file when it was already going to.
- **Automatic & Seamless**: The user does not need to run a manual command. The data stays clean as a natural side effect of using the plugin.
- **Robustness**: By re-calculating all valid IDs from the source text every time, we ensure that the pruning is always accurate and not dependent on a potentially stale cache.
- **Low Risk**: The logic operates on a new `prunedSchedules` object, only replacing the file content at the very end with a known-good, clean version of the data.

## 5. (Optional) Add a Manual Command

For completeness, we could also add a user-facing command like "FSRS: Prune orphaned cards in the current note". This command would essentially run the same logic as outlined above but would be triggered manually by the user. This is a lower priority but could be useful for users who do a lot of refactoring without reviewing.
