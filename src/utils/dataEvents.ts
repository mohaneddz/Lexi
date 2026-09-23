import { emit, listen } from "@tauri-apps/api/event";

// Words and translations live in the Tauri store, but every page (and the
// separate quick-capture window) keeps its own copy in React state. These
// app-wide events tell every copy to re-read after any write, so a capture
// shows up everywhere without a reload.
export type DataKind = "words" | "translations";

const EVENT_NAMES: Record<DataKind, string> = {
  words: "lexi:words-changed",
  translations: "lexi:translations-changed",
};

export function announceDataChanged(kind: DataKind): void {
  void emit(EVENT_NAMES[kind]).catch((error) => {
    console.error(`Failed to announce ${kind} change`, error);
  });
}

export function onDataChanged(kind: DataKind, handler: () => void): () => void {
  const unlisten = listen(EVENT_NAMES[kind], handler);
  return () => {
    void unlisten.then((dispose) => dispose());
  };
}
