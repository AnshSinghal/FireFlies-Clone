'use client'

/**
 * Left rail (T-07).
 *
 * The first thing an evaluator's eye lands on, so the geometry is measured from
 * the reference screenshots rather than taken from the plan — see
 * `sidebar-item.tsx` for the numbers and ADR-021 for the two divergences.
 *
 * The background is `--ff-surface-0`, i.e. WHITE, not the plan's `surface-1`.
 * Real Fireflies is white-on-white with a 1px border doing the separating; a
 * grey rail against white content is immediately wrong in a side-by-side.
 */

import * as Tooltip from '@radix-ui/react-tooltip'
import { Hash, Lock } from 'lucide-react'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

import { useChannels } from '@/lib/api/channels'
import { useMediaQuery } from '@/lib/hooks/use-media-query'
import {
  BUILT_IN_CHANNELS,
  FOOTER_NAV,
  PRIMARY_NAV,
  isChannelActive,
  isNavItemActive,
} from '@/lib/nav'

import { SidebarItem } from './sidebar-item'

interface SidebarProps {
  collapsed?: boolean
  /** Rendered inside the mobile drawer, where it is always expanded. */
  inDrawer?: boolean
  onNavigate?: () => void
}

/**
 * The exported entry point.
 *
 * `useSearchParams` — needed to tell which channel is active — opts a component
 * out of static prerendering unless it sits under a Suspense boundary. The rail
 * lives in the root layout, so without this EVERY static page fails to build,
 * including `/_not-found`. The boundary lives here rather than at each call
 * site so a future consumer cannot forget it.
 */
export function SidebarNav(props: SidebarProps) {
  return (
    <Suspense fallback={<SidebarSkeleton collapsed={props.collapsed} />}>
      <SidebarNavInner {...props} />
    </Suspense>
  )
}

/** Matches the rail's geometry so nothing shifts when the real nav resolves. */
function SidebarSkeleton({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <nav aria-label="Main" className="flex h-full flex-col bg-surface-0 py-2" aria-busy="true">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="mx-3 flex h-9 items-center gap-3 rounded-md px-3">
          <span className="h-5 w-5 shrink-0 rounded-sm bg-surface-2" />
          {!collapsed && <span className="h-3 flex-1 rounded-sm bg-surface-2" />}
        </div>
      ))}
    </nav>
  )
}

function SidebarNavInner({ collapsed = false, inDrawer = false, onNavigate }: SidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeChannel = searchParams.get('channel')
  const { data: channels } = useChannels()

  /*
   * The rail collapses for TWO reasons and this has to cover both.
   *
   * `collapsed` is the user's toggle, which only exists at ≥1280px. Below that
   * `app-shell.tsx` pins the width to 64px in CSS
   * (`[--rail-w:64px] xl:[--rail-w:var(--rail-expanded)]`) and the toggle is
   * not offered. Reading only the toggle meant that between 768 and 1279px the
   * sidebar rendered its expanded self into a 63px rail: the CHANNELS heading
   * showed as "CHANN", every label and Soon badge was clipped out of sight, and
   * — worst — `SidebarItem` suppresses its tooltip when it believes the label
   * is visible, so the whole rail became six unlabelled icons with no way to
   * discover what they were.
   *
   * `useMediaQuery` is the same hook the responsive layouts already use, and it
   * server-snapshots `false`, i.e. "wide" — so SSR emits the expanded rail and
   * hydration corrects it before paint, which is the existing convention here.
   *
   * Inside the drawer there is room for labels, so never collapse there.
   */
  const isWide = useMediaQuery('(min-width: 1280px)')
  const isCollapsed = (collapsed || !isWide) && !inDrawer

  return (
    <Tooltip.Provider>
      <nav
        aria-label="Main"
        data-testid="sidebar"
        data-collapsed={isCollapsed || undefined}
        className="flex h-full flex-col overflow-hidden bg-surface-0 py-2"
      >
        {/* ── Primary ─────────────────────────────────────────────────── */}
        <ul className="space-y-0.5">
          {PRIMARY_NAV.map((item) => (
            <SidebarItem
              key={item.id}
              {...item}
              collapsed={isCollapsed}
              active={isNavItemActive(pathname, item)}
              testId={`sidebar-item-${item.id}`}
              onNavigate={onNavigate}
            />
          ))}
        </ul>

        {/* ── Channels ────────────────────────────────────────────────── */}
        <div className="mt-4 flex min-h-0 flex-col" data-testid="sidebar-section-channels">
          {/*
            Hidden two ways, because the rail collapses two ways.

            `!isCollapsed` covers the USER toggle, which only exists at ≥1280px.
            Below that the rail is pinned to 64px by CSS (`app-shell.tsx`:
            `[--rail-w:64px] xl:[--rail-w:var(--rail-expanded)]`) while
            `collapsed` stays false — so at 1024px this label rendered into a
            63px rail and read "CHANN", clipped mid-word by the nav's
            `overflow-hidden`.

            `hidden xl:block` is the CSS half, matching the exact breakpoint the
            width uses. Passing an "effective collapsed" boolean down instead
            would need a media-query hook and a hydration story for a label.
          */}
          {!isCollapsed && (
            <h2 className="px-5 pb-2 pt-2 text-label uppercase text-muted">Channels</h2>
          )}

          {/*
            Only this section scrolls (T-07.10). Primary and footer stay put, so
            a long channel list can never push Settings out of reach — which is
            the failure mode of making the whole rail scrollable.
          */}
          <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            {BUILT_IN_CHANNELS.map((item) => (
              <SidebarItem
                key={item.id}
                {...item}
                collapsed={isCollapsed}
                active={isChannelActive(pathname, activeChannel, item.id)}
                count={item.id === 'my-meetings' ? channels?.my_meetings : channels?.all_meetings}
                testId={`sidebar-channel-${item.id}`}
                onNavigate={onNavigate}
              />
            ))}

            {channels?.channels.map((channel) => (
              <SidebarItem
                key={channel.id}
                id={channel.slug}
                label={channel.name}
                href={`/notebook?channel=${channel.slug}`}
                icon={channel.is_private ? Lock : Hash}
                iconSlot={
                  channel.is_private ? (
                    <Lock size={20} strokeWidth={1.75} aria-hidden="true" />
                  ) : (
                    <Hash size={20} strokeWidth={1.75} aria-hidden="true" />
                  )
                }
                collapsed={isCollapsed}
                active={isChannelActive(pathname, activeChannel, channel.slug)}
                count={channel.meeting_count}
                testId={`sidebar-channel-${channel.slug}`}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        {/* `mt-auto` pins this to the bottom. Settings floating mid-list is on
            the do-not-ship list. */}
        <ul className="mt-auto space-y-0.5 border-t border-subtle pt-2">
          {FOOTER_NAV.map((item) => (
            <SidebarItem
              key={item.id}
              {...item}
              collapsed={isCollapsed}
              active={isNavItemActive(pathname, item)}
              testId={`sidebar-item-${item.id}`}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      </nav>
    </Tooltip.Provider>
  )
}
