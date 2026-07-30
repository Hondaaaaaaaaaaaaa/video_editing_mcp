// Phase 2 — generic undo/redo for the editor.
//
// The whole editor state (document + selection) travels through here as ONE
// immutable value, which is why the caption ops in captionDoc.ts are pure: a new
// value per edit means undo is just "pop the previous value back".
//
// Two ways to update:
//   - `push`    — a real EDIT. Adds an undo step.
//   - `replace` — a transient change (moving the selection). Rewrites the
//                 present WITHOUT adding an undo step, so Ctrl+Z never has to
//                 chew through a trail of clicks to reach the last real edit.
//   - `reset`   — a new document was loaded. Clears the whole timeline.

import { useCallback, useState } from "react";

const LIMIT = 200; // plenty for a session; keeps memory bounded on long clips

type Timeline<T> = { past: T[]; present: T; future: T[] };

export type History<T> = {
  state: T;
  push: (next: T) => void;
  replace: (next: T) => void;
  reset: (next: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

export const useHistory = <T,>(initial: T): History<T> => {
  const [tl, setTl] = useState<Timeline<T>>({ past: [], present: initial, future: [] });

  const push = useCallback((next: T) => {
    setTl((t) => ({
      past: [...t.past, t.present].slice(-LIMIT),
      present: next,
      future: [], // a fresh edit forks the timeline — the redo branch is gone
    }));
  }, []);

  const replace = useCallback((next: T) => {
    setTl((t) => ({ ...t, present: next }));
  }, []);

  const reset = useCallback((next: T) => {
    setTl({ past: [], present: next, future: [] });
  }, []);

  const undo = useCallback(() => {
    setTl((t) => {
      if (!t.past.length) return t;
      return {
        past: t.past.slice(0, -1),
        present: t.past[t.past.length - 1],
        future: [t.present, ...t.future].slice(0, LIMIT),
      };
    });
  }, []);

  const redo = useCallback(() => {
    setTl((t) => {
      if (!t.future.length) return t;
      return {
        past: [...t.past, t.present].slice(-LIMIT),
        present: t.future[0],
        future: t.future.slice(1),
      };
    });
  }, []);

  return {
    state: tl.present,
    push,
    replace,
    reset,
    undo,
    redo,
    canUndo: tl.past.length > 0,
    canRedo: tl.future.length > 0,
  };
};
