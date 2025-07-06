import { MarkdownView, setIcon } from "obsidian";

import {
	ViewPlugin,
	ViewUpdate,
	Decoration,
	DecorationSet,
	WidgetType,
	EditorView,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

import { DEFAULT_SETTINGS } from "src/types";
import { FSRS_CARD_END_MARKER } from "src/logic/consts";
import FsrsPlugin from "src/main";

export class ClozeContentWidget extends WidgetType {
	constructor(readonly displayedText: string) {
		super();
	}

	toDOM(view: EditorView): HTMLElement {
		const capsule = document.createElement("span");
		capsule.addClass("fsrs-cloze-capsule");
		const iconPart = capsule.createSpan({ cls: "fsrs-cloze-icon-part" });
		iconPart.setText("?");
		const textPart = capsule.createSpan({ cls: "fsrs-cloze-text-part" });
		textPart.setText(this.displayedText);
		return capsule;
	}

	eq(other: ClozeContentWidget) {
		return other.displayedText === this.displayedText;
	}

	ignoreEvent() {
		return true;
	}
}

export function buildClozeViewPlugin(plugin: FsrsPlugin) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			app = plugin.app;
			settings = plugin.settings;

			constructor(view: EditorView) {
				this.decorations = this.buildDecorations(view);
			}

			update(update: ViewUpdate) {
				if (
					update.docChanged ||
					update.viewportChanged ||
					update.selectionSet
				) {
					this.decorations = this.buildDecorations(update.view);
				}
			}

			buildDecorations(view: EditorView): DecorationSet {
				const builder = new RangeSetBuilder<Decoration>();
				const quizKey =
					this.settings.fsrsFrontmatterKey ||
					DEFAULT_SETTINGS.fsrsFrontmatterKey;

				const currentFile =
					this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
				if (!currentFile) return Decoration.none;

				const fileCache =
					this.app.metadataCache.getFileCache(currentFile);
				if (
					!fileCache?.frontmatter ||
					fileCache.frontmatter[quizKey] !== true
				) {
					return Decoration.none;
				}

				const currentSelection = view.state.selection.main;

				for (const { from, to } of view.visibleRanges) {
					const text = view.state.doc.sliceString(from, to);
					const clozeRegex =
						/\{\{([a-zA-Z0-9_-]+):((?:(?!\{\{|\}\}).)+)\}\}/g;
					let match;

					while ((match = clozeRegex.exec(text)) !== null) {
						const matchStartInDoc = from + match.index;
						const matchEndInDoc =
							from + match.index + match[0].length;
						const contentToRender = match[2];

						if (
							!(
								currentSelection.from < matchEndInDoc &&
								currentSelection.to > matchStartInDoc
							)
						) {
							builder.add(
								matchStartInDoc,
								matchEndInDoc,
								Decoration.replace({
									widget: new ClozeContentWidget(
										contentToRender,
									),
								}),
							);
						}
					}
				}
				return builder.finish();
			}
		},
		{
			decorations: (v) => v.decorations,
		},
	);
}

export class QuestionLineWidget extends WidgetType {
	constructor(
		readonly questionText: string,
		readonly style: string | undefined,
	) {
		super();
	}

	toDOM(view: EditorView): HTMLElement {
		// The main container for the line, with the desired paragraph class
		const lineEl = document.createElement("div");
		lineEl.className = "fsrs-question-paragraph";

		// The actual question text
		const textEl = lineEl.createSpan();
		textEl.innerText = this.questionText;

		// The capsule widget at the end
		const capsuleWidget = new SrsCapsuleWidget(this.style);
		const capsuleEl = capsuleWidget.toDOM(view);
		lineEl.appendChild(capsuleEl);

		return lineEl;
	}

	ignoreEvent() {
		return true;
	}
}

export class SrsCapsuleWidget extends WidgetType {
	constructor(readonly style: string | undefined) {
		super();
	}

	toDOM(view: EditorView): HTMLElement {
		const styleDetails = this.getStyleDetails();

		const capsule = document.createElement("span");
		capsule.addClass(
			"fsrs-cloze-capsule",
			"fsrs-srs-capsule",
			styleDetails.className,
		);

		if (this.style === "end") {
			const iconPart = capsule.createSpan({
				cls: "fsrs-cloze-icon-part",
			});
			setIcon(iconPart, styleDetails.icon);
		} else {
			const iconPart = capsule.createSpan({
				cls: "fsrs-cloze-icon-part",
			});
			setIcon(iconPart, "brain");

			// The text part now gets an additional 'has-icon' class
			const textPart = capsule.createSpan({
				cls: ["fsrs-cloze-text-part", "has-icon"],
			});
			const styleIconEl = textPart.createSpan();
			setIcon(styleIconEl, styleDetails.icon);
		}

		capsule.setAttribute("aria-label", styleDetails.hoverText);
		capsule.classList.add("has-tooltip");

		return capsule;
	}

	getStyleDetails(): {
		icon: string;
		hoverText: string;
		className: string;
	} {
		switch (this.style) {
			case "end":
				return {
					icon: "ban",
					hoverText: "End of Card",
					className: "fsrs-srs-style-end",
				};
			default:
				return {
					icon: "help-circle",
					hoverText: "Simple Question",
					className: "fsrs-srs-style-default",
				};
		}
	}

	eq(other: SrsCapsuleWidget) {
		return other.style === this.style;
	}

	ignoreEvent() {
		return true;
	}
}

export function buildSrsMarkerViewPlugin(plugin: FsrsPlugin) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = this.buildDecorations(view);
			}

			update(update: ViewUpdate) {
				if (
					update.docChanged ||
					update.viewportChanged ||
					update.selectionSet
				) {
					this.decorations = this.buildDecorations(update.view);
				}
			}

			buildDecorations(view: EditorView): DecorationSet {
				const builder = new RangeSetBuilder<Decoration>();
				const quizKey =
					plugin.settings.fsrsFrontmatterKey ||
					DEFAULT_SETTINGS.fsrsFrontmatterKey;
				const currentFile =
					plugin.app.workspace.getActiveViewOfType(
						MarkdownView,
					)?.file;
				if (!currentFile) return Decoration.none;

				const fileCache =
					plugin.app.metadataCache.getFileCache(currentFile);
				if (!fileCache?.frontmatter?.[quizKey]) {
					return Decoration.none;
				}

				const selection = view.state.selection.main;
				const questionRegex =
					/[ \t]+\?srs(?:\(([\w-]+)\))?(\s+\^[a-zA-Z0-9]+)?$/;
				const endRegex = new RegExp(
					`^${FSRS_CARD_END_MARKER.replace(
						/[.*+?^${}()|[\]\\]/g,
						"\\$&",
					)}$`,
				);

				for (const { from, to } of view.visibleRanges) {
					let pos = from;
					while (pos <= to) {
						const line = view.state.doc.lineAt(pos);

						const questionMatch = line.text.match(questionRegex);
						const endMatch = line.text.match(endRegex);

						if (questionMatch && questionMatch.index) {
							const markerStart = line.from + questionMatch.index;
							const markerEnd =
								markerStart + questionMatch[0].length;
							const selectionOverlaps =
								selection.from < markerEnd &&
								selection.to > markerStart;

							if (!selectionOverlaps) {
								// Apply a container class to the whole line
								builder.add(
									line.from,
									line.from,
									Decoration.line({
										attributes: {
											class: "fsrs-question-container",
										},
									}),
								);
								// Then, replace only the marker with the widget
								const style = questionMatch[1] || undefined;
								builder.add(
									markerStart,
									markerEnd,
									Decoration.replace({
										widget: new SrsCapsuleWidget(style),
									}),
								);
							}
						} else if (endMatch) {
							const selectionOverlaps =
								selection.from <= line.to &&
								selection.to >= line.from;
							if (!selectionOverlaps) {
								builder.add(
									line.from,
									line.to,
									Decoration.replace({
										widget: new SrsCapsuleWidget("end"),
									}),
								);
							}
						}
						pos = line.to + 1;
					}
				}
				return builder.finish();
			}
		},
		{
			decorations: (v) => v.decorations,
		},
	);
}
