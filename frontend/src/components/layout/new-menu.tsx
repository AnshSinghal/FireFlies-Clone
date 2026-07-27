'use client'

/**
 * `+ New` (T-08.5).
 *
 * The three entries are the three tabs of T-26's create modal. Until that
 * exists they navigate to `/upload`, carrying the intended tab in the query so
 * the modal can open on the right one without this component changing.
 */

import { ChevronDown, FilePlus2, Plus, PlusCircle, Radio, Upload } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { MenuItem, MenuPanel } from '@/components/ui/menu'
import { CaptureLiveModal } from '@/features/placeholders/capture-live-modal'
import { usePopover } from '@/lib/hooks/use-popover'

const OPTIONS = [
  { label: 'Upload transcript', href: '/upload?tab=upload', icon: Upload, testId: 'new-upload' },
  { label: 'Paste transcript', href: '/upload?tab=paste', icon: FilePlus2, testId: 'new-paste' },
  { label: 'Create manually', href: '/upload?tab=manual', icon: PlusCircle, testId: 'new-manual' },
] as const

export function NewMenu() {
  const { open, toggle, close, ref } = usePopover()
  // Modal state lives OUTSIDE the popover: selecting the entry closes the
  // menu, and a modal owned by the closed menu would unmount with it.
  const [captureOpen, setCaptureOpen] = useState(false)

  return (
    <div ref={ref} className="relative">
      <Button
        variant="primary"
        onClick={toggle}
        data-testid="topbar-new-button"
        aria-haspopup="menu"
        aria-expanded={open}
        leftIcon={<Plus size={16} strokeWidth={2.25} className="shrink-0" />}
        rightIcon={<ChevronDown size={14} strokeWidth={2} className="hidden shrink-0 md:inline" />}
      >
        {/* Icon-only below 768px — three fixed-width right-cluster items plus a
            label do not fit a 393px viewport (T-08.11). */}
        <span className="hidden md:inline">New</span>
      </Button>

      {open && (
        <MenuPanel label="Create" testId="topbar-new-menu">
          {OPTIONS.map((option) => (
            <MenuItem
              key={option.href}
              href={option.href}
              icon={option.icon}
              onSelect={close}
              testId={option.testId}
            >
              {option.label}
            </MenuItem>
          ))}
          <MenuItem
            icon={Radio}
            onSelect={() => {
              close()
              setCaptureOpen(true)
            }}
            testId="new-capture-live"
          >
            Capture live meeting
          </MenuItem>
        </MenuPanel>
      )}

      <CaptureLiveModal open={captureOpen} onOpenChange={setCaptureOpen} />
    </div>
  )
}
