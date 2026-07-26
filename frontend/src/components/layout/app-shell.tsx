/**
 * The application shell (T-06.2, T-06.10).
 *
 * CSS GRID, not absolute positioning. The rail's width is a custom property, so
 * collapsing it is one value change and the animation comes free — and, more
 * importantly, `<main>` stays a normal grid cell that establishes its own
 * scroll container. With absolute positioning every panel needs its own
 * offsets, and the Notepad's requirement that only panel interiors scroll
 * (T-18.10) becomes a fight.
 *
 * Responsive behaviour is driven entirely by that one variable:
 *
 *   < 768px   rail collapses to zero and becomes a drawer (T-07.11)
 *   768–1279  rail auto-collapses to 64px, icons only
 *   ≥ 1280    full 240px
 *
 * Fireflies is desktop-first. The mobile job is "not broken", not "excellent".
 *
 * The rail and topbar here are structural placeholders. T-07 and T-08 replace
 * their contents; the geometry is what this task settles.
 */

import type { ReactNode } from 'react'

import { Sidebar } from './sidebar'
import { Topbar } from './topbar'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div
      /*
       * The single column is `minmax(0, 1fr)`, not implicit `auto`.
       *
       * An implicit grid column sizes to max-content, so the topbar's natural
       * width became the column width and every row inherited it — 440px inside
       * a 393px viewport, with the horizontal scrollbar appearing on the page
       * rather than on the offending element. The inner grid had the same
       * problem and the same fix; both are needed.
       */
      className="grid h-screen grid-cols-[minmax(0,1fr)] grid-rows-[56px_1fr] bg-surface-0 [--rail-w:0px] md:[--rail-w:64px] xl:[--rail-w:240px]"
      data-testid="app-shell"
    >
      <Topbar />

      {/*
        `min-h-0` is load-bearing. A grid item defaults to `min-height: auto`,
        which refuses to shrink below its content — so an overflowing <main>
        stretches the row and the PAGE scrolls instead of the panel. This is the
        single line that makes "only panel interiors scroll" work.
      */}
      {/*
        Two things here, both non-obvious.

        `minmax(0, 1fr)` rather than `1fr`: a track sized `1fr` still floors at
        its content's min-width, so one wide child pushes the whole grid past
        the viewport and the PAGE scrolls horizontally. Same trap as the
        `min-h-0` above, on the other axis.

        ONE column below `md`, not a zero-width rail track. The sidebar is
        `display: none` at mobile, which removes it from grid PLACEMENT — so
        `<main>` auto-placed into the first track and rendered inside a 0px
        column. The symptom was a completely blank page below the topbar with
        no error, and nothing in the CSS looked wrong.
      */}
      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)] md:grid-cols-[var(--rail-w)_minmax(0,1fr)]">
        <Sidebar />

        <main
          id="main"
          tabIndex={-1}
          className="min-w-0 overflow-y-auto bg-surface-0"
          data-testid="main-content"
        >
          <div className="mx-auto w-full max-w-content px-4 py-6 md:px-6">{children}</div>
        </main>
      </div>
    </div>
  )
}
