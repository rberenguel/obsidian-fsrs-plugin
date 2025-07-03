# Obsidian FSRS Plugin

A simple plugin for Obsidian using the **FSRS (Free Spaced Repetition Scheduler)** algorithm. Turn your notes into flashcards and review them directly within Obsidian.

This is based on previous places where I have used FSRS ([Weave](https://github.com/rberenguel/weave),
[Garbuix](https://github.com/rberenguel/garbuix)), I just told Gemini what I wanted, gave it the
[sample Obsidian plugin](https://github.com/obsidianmd/obsidian-sample-plugin) and those two codebases
and let it run with it. I played the role product owner / QA. After that, some code cleanup and a big breaking change.

> [!NOTE]
> The screenshots are a couple of patch versions old

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
4.  To end the answer before the note's end or another question's start, simply add `?srs(end)` on its own line. You can do this by using the hotkey `Alt+Q` or the `Mark as quiz / Add card marker` command on an empty line.

**Example:**

```markdown
What is purple and commutes? ?srs ^math_joke
An Abelian grape.
?srs(end)

This line is just a regular note, not part of the answer.
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
    - If the current note is not a quiz file, it adds `quiz: true` to the frontmatter.
    - If on a line with text in a quiz file, it appends `?srs ^...` to turn it into a question.
    - If on an empty line in a quiz file, it inserts the `?srs(end)` marker.

## How Data is Stored

All scheduling data (due dates, stability, etc.) for the cards in a note is stored automatically in a single YAML code block at the very end of the file. You generally do not need to edit this block manually, but can do so if needed. Or delete it if you want to make the card be fresh again.

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

## Installation

1.  Download the latest release from the Releases page on GitHub.
2.  Extract the `main.js`, `manifest.json`, and `styles.css` files.
3.  In your Obsidian vault, navigate to the `.obsidian/plugins/` directory.
4.  Create a new folder (e.g., `obsidian-fsrs-plugin`).
5.  Copy the downloaded files into this new folder.
6.  Restart Obsidian.
7.  Go to **Settings** > **Community Plugins** and enable the plugin.
