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
      className="grid h-screen grid-cols-[minmax(0,1fr)] grid-rows-[56px_1fr] bg-surface-0"
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
          <div className="mx-auto w-full max-w-content px-4 py-6 md:px-6">{children}</div>
        </main>
      </div>

      <SidebarDrawer open={drawerOpen} onClose={closeDrawer} returnFocusTo={toggleRef} />
    </div>
  )
}
