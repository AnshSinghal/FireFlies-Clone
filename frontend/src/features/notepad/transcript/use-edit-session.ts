'use client'

/**
 * The transcript edit session (T-25.1, T-25.3, T-25.5, T-25.11).
 *
 * Three things that only make sense together: whether editing is on, whether a
 * save is in flight, and what the last edits were so they can be undone.
 * Splitting them would mean the undo stack outliving the session that produced
 * it, which is exactly the bug where ⌘Z after leaving edit mode reverts a line
 * somebody has since re-typed.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

/** How long after the last keystroke a save fires (T-25.3). */
export const AUTOSAVE_MS = 800

/** Deep enough to cover a session's worth of corrections, per T-25.5. */
const UNDO_DEPTH = 50

/** How long `Saved` stays on screen before fading. */
const SAVED_VISIBLE_MS = 2000

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface Edit {
  segmentId: number
  /** What it said BEFORE this edit — what ⌘Z restores. */
  previous: string
  next: string
}

export interface EditSession {
  editing: boolean
  status: SaveStatus
  /** True while a save is queued or in flight — what the unload guard checks. */
  dirty: boolean
  canUndo: boolean
  canRedo: boolean
  toggle: () => void
  /** Queues a debounced save. Call on every keystroke. */
  change: (segmentId: number, previous: string, next: string) => void
  /** Saves immediately — ⌘S, or blur. */
  flush: () => void
  undo: () => void
  redo: () => void
}

interface Options {
  onSave: (segmentId: number, text: string) => Promise<unknown>
}

export function useEditSession({ onSave }: Options): EditSession {
  const [editing, setEditing] = useState(false)
  const [status, setStatus] = useState<SaveStatus>('idle')

  const [undoStack, setUndoStack] = useState<Edit[]>([])
  const [redoStack, setRedoStack] = useState<Edit[]>([])

  /** The edit waiting to be written, keyed by segment. */
  const pending = useRef(new Map<number, string>())
  const timer = useRef(0)
  const savedTimer = useRef(0)

  const write = useCallback(async () => {
    const queued = [...pending.current.entries()]
    if (queued.length === 0) return

    pending.current.clear()
    setStatus('saving')

    try {
      // Sequential rather than parallel: two edits to the same line in one
      // batch must land in order, and a transcript edit is not a bulk action.
      for (const [segmentId, text] of queued) await onSave(segmentId, text)

      setStatus('saved')
      window.clearTimeout(savedTimer.current)
      savedTimer.current = window.setTimeout(() => setStatus('idle'), SAVED_VISIBLE_MS)
    } catch {
      // Left visible rather than faded: a failed save is the one status the
      // user has to act on.
      setStatus('error')
    }
  }, [onSave])

  const change = useCallback(
    (segmentId: number, previous: string, next: string) => {
      pending.current.set(segmentId, next)

      setUndoStack((stack) => [...stack, { segmentId, previous, next }].slice(-UNDO_DEPTH))
      // A new edit invalidates the redo branch, the way every editor works.
      setRedoStack([])

      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void write(), AUTOSAVE_MS)
    },
    [write],
  )

  const flush = useCallback(() => {
    window.clearTimeout(timer.current)
    void write()
  }, [write])

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      const last = stack.at(-1)
      if (!last) return stack

      pending.current.set(last.segmentId, last.previous)
      setRedoStack((redo) => [...redo, last])
      window.clearTimeout(timer.current)
      void write()

      return stack.slice(0, -1)
    })
  }, [write])

  const redo = useCallback(() => {
    setRedoStack((stack) => {
      const last = stack.at(-1)
      if (!last) return stack

      pending.current.set(last.segmentId, last.next)
      setUndoStack((undoStack_) => [...undoStack_, last])
      window.clearTimeout(timer.current)
      void write()

      return stack.slice(0, -1)
    })
  }, [write])

  const toggle = useCallback(() => {
    setEditing((on) => {
      // Leaving flushes rather than confirming: the work is already typed, and
      // asking "are you sure" about saving something the user wrote is a
      // question with only one sensible answer (T-25.11).
      if (on) flush()
      else {
        setUndoStack([])
        setRedoStack([])
      }
      return !on
    })
  }, [flush])

  /*
   * The unload guard.
   *
   * Only while something is genuinely unsaved — a `beforeunload` handler that
   * is always registered makes every navigation away from the page show a
   * browser dialog, which trains people to dismiss it.
   */
  const dirty = status === 'saving' || status === 'error'
  useEffect(() => {
    if (!dirty) return

    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  // Flush on unmount, so navigating away inside the app never drops an edit
  // that was still inside its debounce window.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      window.clearTimeout(savedTimer.current)
    },
    [],
  )

  return {
    editing,
    status,
    dirty,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    toggle,
    change,
    flush,
    undo,
    redo,
  }
}
