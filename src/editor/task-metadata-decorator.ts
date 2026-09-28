import {
  Decoration,
  DecorationSet,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  ViewUpdate,
} from '@codemirror/view';
import { editorLivePreviewField } from 'obsidian';

/**
 * Regular expression matching GTD Matrix & Todoist identity comments:
 * - JSON format: <!-- {"uuid":"...","todoistId":"..."} -->
 * - Legacy format: <!-- todoist-id:XXXX -->
 * Includes optional leading whitespace so the task line ends cleanly.
 */
export const TASK_METADATA_REGEX =
  /\s*<!--\s*(?:\{[^>]*?(?:"uuid"|"todoistId")[^>]*?\}|todoist-id:[a-zA-Z0-9_-]+)\s*-->/g;

export function isTaskMetadataComment(text: string): boolean {
  TASK_METADATA_REGEX.lastIndex = 0;
  return TASK_METADATA_REGEX.test(text);
}

const metadataDecorator = new MatchDecorator({
  regexp: TASK_METADATA_REGEX,
  decoration: () =>
    Decoration.replace({
      inclusive: false,
    }),
});

export const taskMetadataViewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.shouldDecorate(view)
        ? metadataDecorator.createDeco(view)
        : Decoration.none;
    }

    update(update: ViewUpdate) {
      if (!this.shouldDecorate(update.view)) {
        this.decorations = Decoration.none;
        return;
      }

      this.decorations = metadataDecorator.updateDeco(update, this.decorations);
    }

    private shouldDecorate(view: EditorView): boolean {
      // Only decorate in Live Preview mode; leave raw markdown visible in Source Mode
      return Boolean(view.state.field(editorLivePreviewField, false));
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);
