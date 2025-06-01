# Simple FSRS (spaced repetition) Obsidian plugin

A hack with the JS FSRS library, the sample Obsidian plugin and Gemini.

This is based on previous places where I have used FSRS ([Weave](https://github.com/rberenguel/weave), 
[Garbuix](https://github.com/rberenguel/garbuix)), I just told Gemini what I wanted, gave it the
[sample Obsidian plugin](https://github.com/obsidianmd/obsidian-sample-plugin) and those two codebases
and let it run with it. I played the role product owner / QA. After that, some code cleanup.

## Why?

I wanted a no-dependency (or at least, easy to analyze as a human) spaced repetition tool I could use for _reasons_.

## TODOs

- [ ] There seems to be a random bug in clozes, where they are badly rendered when asking. It does not always happen though.

## Usage

A question is a note with:

- `quiz: true` in the preamble. The plugin adds an action (recommended shortcut `option q`, which is pretty
  useless on Mac) to set this quickly
- A bunch of text (the question)
- A horizontal row (`---`)
- A bunch of text (the answer)

If all of these things happen, you can be quizzed about it by pressing the "brain" button in the command ribbon
or invoking from the command palette. FSRS scheduling information will be added to a code block at the end of the
note (to make it easier to edit, delete, or survive note renaming).

I have not tested it extensively, just enough to confirm questions happen when they should, scheduling gets updated
in the note and you are only asked for things with the right preamble.

I have also only barely styled it enough to be usable.

You can also have cloze questions with 

```
Some text {{q1:the placeholder}} some more text {{q2:more placeholders}}.
```

Each placeholder will create a new question. Only one placeholder per id for now (no simultaneous replacement yet).

## Future work / TODO

- [ ] Some sort of calendar view of what will be due soon (and then, the option to review early)
- [ ] Deeper integration with other Obsidian features (no idea yet, but I'll come up with something neat)

## Installing

### From a release

Copy over `main.js`, `styles.css`, `manifest.json` from the release you want to your vault 
`VaultFolder/.obsidian/plugins/obsidian-fsrs-plugin/`.

Note that the source code _does not_ include `main.js`, make sure you copy that if you unzip
the source release in your plugins folder.

I'll try to always remember to create a separate zip that can be unzipped directly
under `.obsidian/plugins/`, if I do it will be named `obsidian-fsrs-plugin` in the release.

### From HEAD / latest

Clone this repository on your vault, under `VaultFolder/.obsidian/plugins/` and trigger a build
(from inside the cloned repository folder):

```
npm i
npm run dev # or npm run build
```

This will create the built `main.js`.

## Attribution

- [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) I used the JS build directly. I've never enjoyed
  figuring out Typescript.
- Gemini did most of the heavy lifting, although it had plenty of sample code to work with.

---

### What is the file `llm-context.md`?

This is a file I have been creating lately in all my projects that involve Gemini. I usually run at the end of a chat session
the following prompt (via a text expansion with [espanso](https://github.com/espanso/espanso)):

```
I would like you to summarise what is the goal of the project and how it works,
and what we have been doing. In Markdown in a code block
```

Before, I would just go to a new chat and go from this, but now I have started adding it to the repository directly. It is
usually an interesting summary of what is here and how it evolved.