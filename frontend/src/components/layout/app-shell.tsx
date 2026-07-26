'use client'

/**
 * The application shell (T-06.2, T-06.10, T-07.6).
 *
 * CSS GRID, not absolute positioning. The rail's width is a custom property, so
 * collapsing it is one value change and the animation comes free — and `<main>`
 * stays a normal grid cell that establishes its own scroll container.
 *
 * Responsive behaviour is driven entirely by that variable:
 *
 *   < 768px   no rail; the toggle opens a drawer instead (T-07.11)
 *   768–1279  64px, icons only
 *   ≥ 1280    240px, or 64px when the user has collapsed it
 *
 * Fireflies is desktop-first. The mobile job is "not broken", not "excellent".
 */

import { useRef, type ReactNode } from 'react'

import { useSidebar } from '@/lib/hooks/use-sidebar'

import { SidebarNav } from './sidebar'
import { SidebarDrawer } from './sidebar-drawer'
import { ConnectionStatus } from './connection-status'
import { Topbar } from './topbar'

export function AppShell({ children }: { children: ReactNode }) {
  const { collapsed, toggleCollapsed, drawerOpen, openDrawer, closeDrawer } = useSidebar()
  const toggleRef = useRef<HTMLButtonElement>(null)

  return (
    <div
      /*
       * The single column is `minmax(0, 1fr)`, not implicit `auto`: an implicit
       * track sizes to max-content, so the topbar's natural width became the
       * column width and the whole PAGE scrolled sideways (ADR-020).
       *
       * `--rail-w` carries the collapse state, so the width transition is one
       * animated custom property rather than conditional classes.
       */
      /*
        THREE rows, not two. Adding the connection status as a third child of a
        two-row grid auto-places it into an implicit row, which works by
        accident until something depends on the explicit track list — the same
        family of silent grid failure as ADR-020.

        `auto` because the row is 2px normally and a full banner when offline.
      */
      className="grid h-screen grid-cols-[minmax(0,1fr)] grid-rows-[56px_auto_minmax(0,1fr)] bg-surface-0"
      style={
        {
          '--rail-expanded': collapsed ? '64px' : '240px',
        } as React.CSSProperties
      }
      data-testid="app-shell"
    >
      <Topbar
        onToggleSidebar={drawerOpen ? closeDrawer : openDrawer}
        toggleRef={toggleRef}
        onCollapse={toggleCollapsed}
      />

      {/* Directly under the topbar: both states it renders describe the whole
          page rather than any one panel. */}
      <ConnectionStatus />

      {/*
        `minmax(0, 1fr)` again on the content column, and ONE column below `md`:
        the sidebar is `display: none` there, which removes it from grid
        PLACEMENT, so `<main>` auto-placed into the 0px rail track and rendered
        a blank page (ADR-020).
      */}
      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)] [--rail-w:64px] md:grid-cols-[var(--rail-w)_minmax(0,1fr)] xl:[--rail-w:var(--rail-expanded)]">
        <aside
          className="hidden overflow-hidden border-r border-subtle transition-[width] duration-base ease-ff md:block"
          data-testid="sidebar-rail"
        >
          <SidebarNav collapsed={collapsed} />
        </aside>

        <main
          id="main"
          tabIndex={-1}
          className="min-w-0 overflow-y-auto bg-surface-0"
          data-testid="main-content"
        >
          {/*
            FULL HEIGHT and no padding.

            It used to be `px-4 py-6` on an auto-height div, which meant `h-full`
            on a page resolved against nothing and grew to its content — so the
            Notepad's panels never became scroll containers and the whole page
            scrolled instead, taking the header with it.

            Padding is now a per-page decision, because it is one: the Notebook
            wants it and the Notepad is a full-bleed workspace.
          */}
          <div className="mx-auto flex h-full w-full max-w-content flex-col">{children}</div>
        </main>
      </div>

      <SidebarDrawer open={drawerOpen} onClose={closeDrawer} returnFocusTo={toggleRef} />
    </div>
  )
}
