# Lessons Learned

## 2025-07-09

- **Lesson:** When programmatically generating UI elements, such as table rows, it is crucial to verify that the correct classes are applied to each element. A simple copy-paste error in `QuestionBrowserModal.ts` assigned a wide-column CSS class to a narrow-column's data, causing a visual bug that was hard to trace.
- **Lesson:** When logic relies on the sequence of `if/else if` checks (e.g., checking for a more specific string like `?srs(cram)` before a less specific one like `?srs` which it contains), a clarifying code comment is essential to prevent future developers from breaking the logic.
