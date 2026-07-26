'use client'

/**
 * `+ New` (T-08.5).
 *
 * The three entries are the three tabs of T-26's create modal. Until that
 * exists they navigate to `/upload`, carrying the intended tab in the query so
 * the modal can open on the right one without this component changing.
 */

import { ChevronDown, FilePlus2, Plus, PlusCircle, Upload } from 'lucide-react'

import { MenuItem, MenuPanel } from '@/components/ui/menu'
import { usePopover } from '@/lib/hooks/use-popover'

const OPTIONS = [
  { label: 'Upload transcript', href: '/upload?tab=upload', icon: Upload, testId: 'new-upload' },
  { label: 'Paste transcript', href: '/upload?tab=paste', icon: FilePlus2, testId: 'new-paste' },
  { label: 'Create manually', href: '/upload?tab=manual', icon: PlusCircle, testId: 'new-manual' },
] as const

export function NewMenu() {
  const { open, toggle, close, ref } = usePopover()

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        data-testid="topbar-new-button"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-btn-md items-center gap-1.5 rounded-md bg-accent px-3 text-body-strong text-inverse transition-colors duration-fast hover:bg-accent-hover active:bg-accent-pressed"
      >
        <Plus size={16} strokeWidth={2.25} className="shrink-0" />
        {/* Icon-only below 768px — three fixed-width right-cluster items plus a
            label do not fit a 393px viewport (T-08.11). */}
        <span className="hidden md:inline">New</span>
        <ChevronDown size={14} strokeWidth={2} className="hidden shrink-0 md:inline" />
      </button>

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
        </MenuPanel>
      )}
    </div>
  )
}
