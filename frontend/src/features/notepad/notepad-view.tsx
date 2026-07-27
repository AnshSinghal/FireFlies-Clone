'use client'

/**
 * The Notepad shell (T-18).
 *
 * A fixed-chrome, dual-pane workspace: the header stays put and only the panel
 * INTERIORS scroll. Getting that wrong — letting the page scroll so the header
 * disappears — is instantly obvious against the real app, and it is the thing
 * T-18.10 is written to prevent.
 */

import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Tabs, TabPanel } from '@/components/ui/controls'
import { ResizablePanels } from '@/components/ui/resizable-panels'
import { SkeletonText } from '@/components/ui/skeleton'
import { StateView } from '@/components/ui/state-view'
import { useToast } from '@/components/ui/toast'
import { ApiError } from '@/lib/api/client'
import { useDeleteMeeting, useMeeting } from '@/lib/api/meetings'
import { useRegenerateSummary } from '@/lib/api/summaries'
import { useMediaQuery } from '@/lib/hooks/use-media-query'
import { NotepadCommandsProvider } from '@/lib/notepad/commands'
import { mediaSrc } from '@/lib/player/media-src'
import { PlayerProvider, usePlayer } from '@/lib/player/player-context'
import { usePlayerShortcuts } from '@/lib/player/use-player-shortcuts'
import { useTimeLink } from '@/lib/player/use-time-link'
import { notebookReturnUrl } from '@/lib/notebook-return'
import { TOAST_MESSAGES } from '@/lib/toast/messages'

import { IconRail, RailFlyout, type RailItemId } from './icon-rail'
import { NotepadHeader } from './notepad-header'
import { ShortcutsModal } from './player/shortcuts-modal'
import { IndexPanel } from './summary/index-panel'
import { SmartSearchPanel } from './transcript/smart-search-panel'
import { SummaryPanel } from './summary-panel'
import { TranscriptPanel } from './transcript-panel'

export const SPLIT_STORAGE_KEY = 'ff.notepad.split'

export function NotepadView({ meetingId }: { meetingId: number }) {
  const { data: meeting, isPending, isError, error } = useMeeting(meetingId)
  const toast = useToast()
  const regenerate = useRegenerateSummary(meetingId)
  const remove = useDeleteMeeting()

  const [openPanel, setOpenPanel] = useState<RailItemId | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [tab, setTab] = useState('summary')

  // Below 1024px the split becomes tabs (T-18.9): two 300px panels side by side
  // are two unusable panels.
  const isNarrow = useMediaQuery('(max-width: 1023px)')

  /*
   * The tab title follows the meeting, and follows an EDIT to it (T-18.11).
   *
   * Set imperatively rather than through Next's metadata API because the title
   * is client-state here — it changes without a navigation when the user
   * renames the meeting.
   */
  useEffect(() => {
    if (!meeting) return
    document.title = `${meeting.title} · Fireflies`
    return () => {
      document.title = 'Fireflies'
    }
  }, [meeting])

  const src = meeting ? mediaSrc(meeting) : null
  const meetingTitle = meeting?.title ?? ''

  const panels = useMemo(
    () => ({
      summary: <SummaryPanel meetingId={meetingId} title={meetingTitle} />,
      transcript: <TranscriptPanel meetingId={meetingId} mediaSrc={src} />,
    }),
    [meetingId, src, meetingTitle],
  )

  if (isError) {
    const notFound = error instanceof ApiError && (error.status === 404 || error.status === 410)
    return (
      <StateView
        variant="error"
        testId="notepad-error"
        title={
          notFound ? "This meeting doesn't exist or was deleted" : "Couldn't load this meeting"
        }
        body={
          notFound
            ? 'It may have been removed, or the link may be wrong.'
            : error instanceof Error
              ? error.message
              : undefined
        }
        action={
          <Button variant="primary" asChild>
            <a href={notebookReturnUrl()}>Back to meetings</a>
          </Button>
        }
        className="m-6"
      />
    )
  }

  return (
    <div
      data-testid="notepad-page"
      /*
       * `h-full` and `min-h-0` on a flex column: the shell's `<main>` is a grid
       * cell, and without `min-h-0` a scrollable child stretches its parent
       * instead of scrolling (ADR-020, the third trap).
       */
      className="flex h-full min-h-0 flex-col"
    >
      {isPending || !meeting ? (
        <div className="space-y-4 p-6" aria-busy="true" aria-label="Loading meeting">
          <SkeletonText lines={2} className="max-w-md" />
          <SkeletonText lines={12} />
        </div>
      ) : (
        <PlayerProvider durationMs={meeting.duration_seconds * 1000} src={src}>
          <NotepadCommandsProvider>
            <NotepadHeader
              meeting={meeting}
              onRegenerate={() =>
                regenerate.mutate(undefined, {
                  onSuccess: () => toast.success(TOAST_MESSAGES.summaryRegenerated),
                })
              }
              onDelete={() => setConfirmingDelete(true)}
            />

            <div className="flex min-h-0 flex-1 flex-col md:flex-row">
              <IconRail
                active={openPanel}
                onToggle={(id) => setOpenPanel((current) => (current === id ? null : id))}
              />

              {openPanel && (
                <RailFlyout item={openPanel} onClose={() => setOpenPanel(null)}>
                  {/* Smart Search (T-22.10) and Index (T-23.13) are real; the
                    other three rail items are still placeholders, and the
                    flyout says so itself. */}
                  {openPanel === 'search' ? <SmartSearchPanel meetingId={meetingId} /> : undefined}
                  {openPanel === 'index' ? <IndexPanel meetingId={meetingId} /> : undefined}
                </RailFlyout>
              )}

              {isNarrow ? (
                <div className="flex min-h-0 flex-1 flex-col" data-testid="notepad-tabs">
                  {/*
                  The panels are CHILDREN of `Tabs`, not siblings.

                  Radix's `Tabs.Content` throws outside its `Tabs.Root`, and
                  the route error boundary swallowed it into "Something went
                  wrong" — visible only below 1024px, which is why the desktop
                  tests were all green.
                */}
                  <Tabs
                    value={tab}
                    onValueChange={setTab}
                    tabs={[
                      { value: 'summary', label: 'Summary' },
                      { value: 'transcript', label: 'Transcript' },
                    ]}
                  >
                    <TabPanel value="summary" className="min-h-0 flex-1 overflow-hidden">
                      {panels.summary}
                    </TabPanel>
                    <TabPanel value="transcript" className="min-h-0 flex-1 overflow-hidden">
                      {panels.transcript}
                    </TabPanel>
                  </Tabs>
                </div>
              ) : (
                <ResizablePanels
                  storageKey={SPLIT_STORAGE_KEY}
                  leftLabel="Summary"
                  rightLabel="Transcript"
                  className="min-h-0 flex-1"
                  left={panels.summary}
                  right={panels.transcript}
                />
              )}
            </div>

            {/*
            Inside the provider, because it binds the transport. A hook needs
            the player, and the player only exists once the meeting has loaded
            and its duration is known.
          */}
            <PlayerKeyboard />

            <ConfirmDialog
              open={confirmingDelete}
              onOpenChange={setConfirmingDelete}
              title="Delete meeting?"
              objectName={meeting.title}
              body="and its transcript, summary, and action items will be deleted."
              onConfirm={async () => {
                await remove.mutateAsync(meeting.id)
                toast.success(TOAST_MESSAGES.meetingDeleted)
                window.location.href = notebookReturnUrl()
              }}
            />
          </NotepadCommandsProvider>
        </PlayerProvider>
      )}
    </div>
  )
}

/**
 * The page-level keyboard bindings and the `?t=` link (T-19.11, T-19.12).
 *
 * A component rather than a call inside `NotepadView` because both hooks need
 * `usePlayer`, and `NotepadView` is what RENDERS the provider — a component
 * cannot consume a context it provides itself.
 */
function PlayerKeyboard() {
  const player = usePlayer()
  const [showShortcuts, setShowShortcuts] = useState(false)

  usePlayerShortcuts({
    player,
    onShowHelp: () => setShowShortcuts(true),
  })

  useTimeLink({
    currentMs: player.currentMs,
    isPlaying: player.isPlaying,
    ready: player.durationMs > 0,
    onSeek: player.seek,
  })

  return <ShortcutsModal open={showShortcuts} onOpenChange={setShowShortcuts} />
}
