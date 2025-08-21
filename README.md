# Obsidian FSRS Plugin

A simple plugin for Obsidian using the **FSRS (Free Spaced Repetition Scheduler)** algorithm. Turn your notes into flashcards and review them directly within Obsidian.

This is based on previous places where I have used FSRS ([Weave](https://github.com/rberenguel/weave),
[Garbuix](https://github.com/rberenguel/garbuix)), I just told Gemini what I wanted, gave it the
[sample Obsidian plugin](https://github.com/obsidianmd/obsidian-sample-plugin) and those two codebases
and let it run with it. I played the role product owner / QA. After that, some code cleanup and a big breaking change.

> [!NOTE]
> The screenshots are a couple of patch versions old. The difference is not huge.

![](https://raw.githubusercontent.com/rberenguel/obsidian-fsrs-plugin/main/media/modal-question-and-editor.png)

![](https://raw.githubusercontent.com/rberenguel/obsidian-fsrs-plugin/main/media/modal-answer.png)

![](https://raw.githubusercontent.com/rberenguel/obsidian-fsrs-plugin/main/media/question-and-editor.png)

## Features

- **Proven FSRS Algorithm**: Utilizes a modern scheduling algorithm to optimize your review sessions.
- **Note-Based Flashcards**: Create multiple, distinct flashcards directly within your regular notes, keeping information in context.
- **Hybrid System**: Combines the performance of file-level discovery and filtering (`quiz: true`) with the flexibility of block-based cards.
- **Multiple Card Types**: Supports both classic **Question/Answer** cards and **Cloze Deletions** within the same note. Some more might come (like [anki--ordered--multi-choice](https://github.com/rberenguel/anki--ordered--multi-choice)) later.
- **In-Editor Review**: A clean, minimal quiz modal keeps you inside your Obsidian workflow.
- **Calendar View**: Visualize your upcoming and overdue reviews on a dedicated calendar pane.
- **Customizable Hotkeys**: Set your own single-key hotkeys for rating cards (Again, Hard, Good, Easy).

## How to Use: The Workflow

The workflow is designed to be simple and stay out of your way.

### 1. Mark a Note as a "Quiz File"

First, tell the plugin which notes contain flashcards.

- Open a note and add the key `quiz: true` to the frontmatter.

    ```yaml
    ---
    quiz: true
    ---
    ```

- **Alternatively**, use the hotkey `Alt+Q` (or run the command `Mark as quiz / Add card marker`) in a note to add this key automatically.

### 2. Create Your Cards

You can create two types of cards within any "Quiz File".

#### Question & Answer Cards

This is the standard flashcard format.

1.  Write your question on a single line.
2.  At the end of the line, add the marker `?srs`. The plugin will automatically append a unique block ID (`^...`) for tracking.
3.  Write your answer on the following line(s). The answer can be multiple lines long.
4.  To end the answer, add `?srs(end)` on its own line.

> **New in version 0.6.0: Cram Mode**
> To mark a card for more aggressive "cramming" reviews, use the marker `?srs(cram)` instead. These cards will use a separate, higher retention rate (configurable in settings) to appear more frequently. Use the `Alt+Q` hotkey on a question line to cycle between `?srs` and `?srs(cram)`.

**Example:**

```markdown
What is purple and commutes? ?srs ^math_joke
An Abelian grape.

This question is for cramming. ?srs(cram) ^cram_joke
What do you call a crushed angle? A rect-angle!

?srs(end)

Whatever else.
```

#### Cloze Deletion Cards

This format allows you to hide parts of a sentence.

1.  Wrap the text you want to hide in `{{c1::...}}`.
2.  Use a unique identifier for each cloze in the note (`c1`, `c2`, `cloze_one`, etc.). Each cloze will become a separate flashcard.

**Example:**

```markdown
The FSRS algorithm was developed to improve upon the {{c1::SM-2}} algorithm used in older SRS software. Each cloze, like this one {{c2::and this one}}, becomes a unique card.
```

### 3. Review Your Due Cards

- Click the **Brain icon** in the left ribbon to start a review session.
- Alternatively, run the command `Start FSRS Quiz Review`.
- The quiz modal will appear, showing you one due card at a time. Press the spacebar to reveal the answer, then rate your performance using the hotkeys.

## Commands

- **`Start FSRS Quiz Review`**: Launches the quiz modal with all cards that are currently due.
- **`Open FSRS Calendar`**: Opens a side pane showing your review schedule on a calendar.
- **`Mark as quiz / Add card marker`** (`Alt+Q`): A powerful, context-aware command:
    - If the current note is not a quiz file, it adds `fsrs: true` to the frontmatter.
    - If on a line with text, it appends `?srs ^...` to turn it into a question.
    - **If on a line that is already a question, it cycles the marker between `?srs` and `?srs(cram)`.**
    - If on an empty line, it inserts the `?srs(end)` marker.

## How Data is Stored

All scheduling data (due dates, stability, etc.) for the cards in a note is stored automatically in a single YAML code block at the very end of the file. You generally do not need to edit this block manually, but can do so if needed. Or delete it if you want to make the card be fresh again.

## Advanced Features

Beyond the basic workflow, FSRS for Obsidian offers powerful tools to manage your review sessions.

### Question Browser

The Question Browser gives you a complete overview of all your flashcards in one place. To open it, click the **folder icon** in the left ribbon or run the command `Open Question Browser`.

From the browser, you can:

- **Filter and Sort**:

    - Quickly find cards by typing directly into the search bar. You can search for text in the question, file path, status (`suspended`, `buried`), or due date (`new`, `today`, `tomorrow`).
    - Use special operators for more specific searches:
        - `q: <text>`: Search only within the question text.
        - `file: <path>`: Filter by file path.
        - `type: <cram|normal>`: Show only cram or normal cards.
        - `status: <suspended|buried>`: Filter by card status.
    - Click on any column header to sort the entire table.

- **Suspend/Unsuspend Cards**:

    - Click the icon in the "Actions" column to toggle a card's "suspended" state. Suspended cards are temporarily removed from all review sessions until you unsuspend them.

- **Start a Custom Study Session**:
    - Select one or more cards using the checkboxes.
    - Click the **Custom Study** button to start a quiz session with only the selected cards. This is perfect for targeted review before an exam or when you want to focus on a specific topic.

### Suspending and Burying Cards

To give you more control over your reviews, the plugin includes "suspend" and "bury" features, similar to those in other SRS software.

- **Suspend**: A suspended card is taken out of the review queue indefinitely. It will not appear in any quiz session (standard or custom) until you manually unsuspend it. You can suspend a card from the Question Browser.

- **Bury**: A buried card is temporarily hidden until the next day. This is useful when you encounter a card you're not ready for or that you've just reviewed outside the plugin. _Currently, burying happens automatically for related cards (e.g., other cloze deletions from the same note) when you review one of them, but manual burying will be added in a future update._

---

```srs-data
^math_joke:
  due: 2025-07-15T14:00:00.000Z
  stability: 4.5
  difficulty: 6.2
  [...]
c1:
  due: 2025-08-01T10:00:00.000Z
  stability: 15.1
  difficulty: 3.0
  [...]
```

Markdown

## Settings

The plugin provides several settings to customize your experience:

- **FSRS frontmatter key**: The key to identify quiz notes (default: `fsrs`).
- **Quiz Rating Hotkeys**: Customize the single-character keys for rating cards (Again, Hard, Good, Easy).
- **Max new cards per day**: Set a limit on how many new cards are introduced daily.
- **Shuffle new cards**: Toggle whether to randomize the order of new cards.
- **Cram Card Retention Rate**: Set the desired retention for cards marked with `?srs(cram)` (default: `0.99`).

## Installation

1.  Download the latest release from the Releases page on GitHub.
2.  Extract the `main.js`, `manifest.json`, and `styles.css` files.
3.  In your Obsidian vault, navigate to the `.obsidian/plugins/` directory.
4.  Create a new folder (e.g., `obsidian-fsrs-plugin`).
5.  Copy the downloaded files into this new folder.
6.  Restart Obsidian.
7.  Go to **Settings** > **Community Plugins** and enable the plugin.
