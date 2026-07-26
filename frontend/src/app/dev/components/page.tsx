'use client'

/**
 * Component gallery (T-10.17) — every primitive in every state.
 *
 * This is three things at once: the visual-regression baseline (T10-M), the
 * surface the accessibility and focus-ring sweeps run against (T10-B, T10-L),
 * and the fastest way to see a token change land everywhere. Not linked from
 * the app's navigation.
 */

import { Archive, Copy, Download, Pencil, Plus, Share2, Trash2 } from 'lucide-react'
import { notFound } from 'next/navigation'
import { useState, type ReactNode } from 'react'

import { Avatar, AvatarGroup } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge, Chip, RemovableChip, ToggleChip } from '@/components/ui/chip'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Checkbox, RadioGroup, Switch, TabPanel, Tabs } from '@/components/ui/controls'
import { DatePicker, type DateRange } from '@/components/ui/date-picker'
import {
  Dropdown,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownSub,
} from '@/components/ui/dropdown'
import { EmptySearch, EmptyState } from '@/components/ui/empty-state'
import { Highlighter } from '@/components/ui/highlighter'
import { IconButton } from '@/components/ui/icon-button'
import { Input, Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Pagination, ProgressBar } from '@/components/ui/pagination'
import { Popover } from '@/components/ui/popover'
import { ResizablePanels } from '@/components/ui/resizable-panels'
import { SearchInput } from '@/components/ui/search-input'
import { Select } from '@/components/ui/select'
import { MeetingRowSkeleton, Skeleton, SkeletonText } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { DEV_SURFACES_ENABLED } from '@/lib/dev-surfaces'

const PEOPLE = [
  { name: 'Priya Raghunathan' },
  { name: 'Marcus Bell' },
  { name: 'Sarah Okonkwo' },
  { name: 'Dev Patel' },
  { name: 'Lena Fischer' },
]

/** 24 people, for T10-G's `+21`. */
const CROWD = Array.from({ length: 24 }, (_, i) => ({ name: `Person ${i + 1} Surname` }))

function Section({ title, children, id }: { title: string; children: ReactNode; id: string }) {
  return (
    <section id={id} data-testid={`gallery-${id}`} className="space-y-3">
      <h2 className="text-h2 text-primary">{title}</h2>
      <div className="flex flex-wrap items-start gap-3 rounded-lg border border-subtle p-4">
        {children}
      </div>
    </section>
  )
}

export default function ComponentGalleryPage() {
  // Dev/test tooling; never part of the shipped app.
  if (!DEV_SURFACES_ENABLED) notFound()

  const toast = useToast()

  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState(true)
  const [indeterminate, setIndeterminate] = useState<boolean | 'indeterminate'>('indeterminate')
  const [switched, setSwitched] = useState(true)
  const [radio, setRadio] = useState('newest')
  const [tab, setTab] = useState('overview')
  const [selected, setSelected] = useState('-started_at')
  const [chipOn, setChipOn] = useState(true)
  const [chips, setChips] = useState(['roadmap', 'pricing', 'q3'])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(4)
  const [modalOpen, setModalOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [range, setRange] = useState<DateRange | null>(null)

  return (
    <div className="space-y-8 p-8" data-testid="component-gallery">
      <header className="space-y-1">
        <h1 className="text-display text-primary">Component gallery</h1>
        <p className="text-body text-secondary">
          Every primitive from A4, in every state. Dev-only.
        </p>
      </header>

      <Section id="buttons" title="Button">
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="link">Link</Button>
        <Button variant="primary" disabled>
          Disabled
        </Button>
        <Button variant="primary" leftIcon={<Plus size={16} strokeWidth={2} />}>
          With icon
        </Button>
        <Button variant="secondary" size="sm">
          Small
        </Button>
        <Button variant="secondary" size="lg">
          Large
        </Button>
        <Button
          variant="primary"
          loading={loading}
          leftIcon={<Download size={16} strokeWidth={2} />}
          data-testid="loading-button"
          onClick={() => setLoading((v) => !v)}
        >
          Toggle loading
        </Button>
        <Button variant="secondary" iconOnly aria-label="Archive">
          <Archive size={16} strokeWidth={1.75} />
        </Button>
      </Section>

      <Section id="icon-buttons" title="IconButton + Tooltip">
        <IconButton label="Copy link" icon={<Copy size={16} strokeWidth={1.75} />} />
        <IconButton
          label="Edit"
          icon={<Pencil size={16} strokeWidth={1.75} />}
          variant="secondary"
        />
        <IconButton
          label="Delete"
          icon={<Trash2 size={16} strokeWidth={1.75} />}
          variant="danger"
        />
        <IconButton label="Share" icon={<Share2 size={14} strokeWidth={1.75} />} size="sm" />
        <IconButton label="Disabled" icon={<Copy size={16} strokeWidth={1.75} />} disabled />
      </Section>

      <Section id="inputs" title="Input / Textarea / Select / DatePicker">
        <div className="w-64 space-y-3">
          <Input label="Meeting title" placeholder="Q3 Roadmap Sync" />
          <Input label="With helper" helper="Shown to everyone on the call." placeholder="Notes" />
          <Input label="With error" error="Title is required." defaultValue="" />
          <Input label="Disabled" disabled defaultValue="Locked" />
        </div>
        <div className="w-64 space-y-3">
          <Textarea
            label="Overview"
            placeholder="What was decided…"
            maxChars={280}
            value=""
            onChange={() => {}}
          />
          <Select
            label="Sort"
            value={selected}
            onValueChange={setSelected}
            options={[
              { value: '-started_at', label: 'Newest first' },
              { value: 'started_at', label: 'Oldest first' },
              { value: 'title', label: 'Title A–Z' },
            ]}
          />
          <DatePicker value={range} onChange={setRange} now={new Date('2026-07-26T09:00:00Z')} />
        </div>
      </Section>

      <Section id="search" title="SearchInput">
        <div className="w-96">
          <SearchInput
            value={search}
            onChange={setSearch}
            ariaLabel="Search the gallery"
            hint="⌘K"
            testId="gallery-search"
          />
        </div>
        <div className="w-96">
          <SearchInput value="loading" onChange={() => {}} ariaLabel="Search, loading" loading />
        </div>
      </Section>

      <Section id="chips" title="Chip / Badge">
        <Chip>Static keyword</Chip>
        <ToggleChip
          selected={chipOn}
          onToggle={() => setChipOn((v) => !v)}
          testId="gallery-toggle-chip"
        >
          Toggle filter
        </ToggleChip>
        <ToggleChip selected={false} onToggle={() => {}}>
          Off
        </ToggleChip>
        {chips.map((chip) => (
          <RemovableChip
            key={chip}
            label={chip}
            onRemove={() => setChips((current) => current.filter((c) => c !== chip))}
          />
        ))}
        <Badge>Neutral</Badge>
        <Badge variant="accent">Accent</Badge>
        <Badge variant="success" dot>
          Ready
        </Badge>
        <Badge variant="warning" dot>
          Processing
        </Badge>
        <Badge variant="danger" dot>
          Failed
        </Badge>
        <Badge variant="accent" shape="count">
          12
        </Badge>
      </Section>

      <Section id="avatars" title="Avatar / AvatarGroup">
        <Avatar name="Priya Raghunathan" size="sm" />
        <Avatar name="Marcus Bell" size="md" />
        <Avatar name="Sarah Okonkwo" size="lg" />
        <Avatar name="Cher" size="md" />
        <AvatarGroup people={PEOPLE} />
        <AvatarGroup people={CROWD} />
      </Section>

      <Section id="controls" title="Checkbox / Switch / Radio">
        <div className="space-y-2">
          <Checkbox checked={checked} onCheckedChange={setChecked} label="Checked" />
          <Checkbox checked={false} onCheckedChange={() => {}} label="Unchecked" />
          <Checkbox
            checked={indeterminate}
            onCheckedChange={(next) => setIndeterminate(next)}
            label="Indeterminate"
          />
          <Checkbox checked={false} onCheckedChange={() => {}} label="Disabled" disabled />
        </div>
        <div className="space-y-2">
          <Switch
            checked={switched}
            onCheckedChange={setSwitched}
            label="Email digests"
            description="Weekly, on Mondays."
          />
          <Switch checked={false} onCheckedChange={() => {}} label="Off" />
          <Switch checked={false} onCheckedChange={() => {}} label="Disabled" disabled />
        </div>
        <RadioGroup
          label="Sort order"
          value={radio}
          onValueChange={setRadio}
          options={[
            { value: 'newest', label: 'Newest first' },
            { value: 'oldest', label: 'Oldest first', description: 'Chronological.' },
          ]}
        />
      </Section>

      <Section id="tabs" title="Tabs">
        <div className="w-full">
          <Tabs
            value={tab}
            onValueChange={setTab}
            tabs={[
              { value: 'overview', label: 'Overview' },
              { value: 'transcript', label: 'Transcript' },
              { value: 'actions', label: 'Action items', count: 4 },
            ]}
          >
            <TabPanel value="overview" className="py-3 text-body text-secondary">
              The overview panel.
            </TabPanel>
            <TabPanel value="transcript" className="py-3 text-body text-secondary">
              The transcript panel.
            </TabPanel>
            <TabPanel value="actions" className="py-3 text-body text-secondary">
              The action items panel.
            </TabPanel>
          </Tabs>
        </div>
      </Section>

      <Section id="overlays" title="Dropdown / Popover / Modal / ConfirmDialog">
        <Dropdown
          testId="gallery-dropdown"
          trigger={<Button variant="secondary">Open menu</Button>}
        >
          <DropdownLabel>Actions</DropdownLabel>
          <DropdownItem icon={<Copy size={16} strokeWidth={1.75} />} shortcut="⌘C">
            Copy link
          </DropdownItem>
          <DropdownItem icon={<Pencil size={16} strokeWidth={1.75} />}>Rename</DropdownItem>
          <DropdownSub label="Export" icon={<Download size={16} strokeWidth={1.75} />}>
            <DropdownItem>PDF</DropdownItem>
            <DropdownItem>Markdown</DropdownItem>
            <DropdownItem>Plain text</DropdownItem>
          </DropdownSub>
          <DropdownItem disabled>Disabled item</DropdownItem>
          <DropdownSeparator />
          <DropdownItem danger icon={<Trash2 size={16} strokeWidth={1.75} />}>
            Delete
          </DropdownItem>
        </Dropdown>

        <Popover
          label="Filters"
          testId="gallery-popover"
          trigger={<Button variant="secondary">Open popover</Button>}
        >
          <div className="space-y-2">
            <p className="text-body-strong text-primary">A panel, not a menu</p>
            <Checkbox checked onCheckedChange={() => {}} label="Only my meetings" />
            <Checkbox checked={false} onCheckedChange={() => {}} label="Has action items" />
          </div>
        </Popover>

        <Button variant="secondary" onClick={() => setModalOpen(true)} data-testid="open-modal">
          Open modal
        </Button>
        <Button variant="danger" onClick={() => setConfirmOpen(true)} data-testid="open-confirm">
          Open confirm
        </Button>

        <Modal
          open={modalOpen}
          onOpenChange={setModalOpen}
          title="Edit meeting details"
          description="Changes apply to everyone with access."
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => setModalOpen(false)}>
                Save changes
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <Input label="Title" defaultValue="Q3 Product Roadmap Sync" />
            <Textarea label="Notes" value="" onChange={() => {}} />
          </div>
        </Modal>

        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Delete meeting?"
          objectName="Q3 Product Roadmap Sync"
          body="and its transcript, summary, and action items will be deleted."
          onConfirm={async () => {
            // A real request would go here; the delay exists so the loading
            // state and the double-fire guard are observable.
            await new Promise((resolve) => setTimeout(resolve, 400))
            toast.success('Meeting deleted')
          }}
        />
      </Section>

      <Section id="feedback" title="Skeleton / ProgressBar / Highlighter">
        <div className="w-64 space-y-3">
          <Skeleton variant="text" className="w-1/2" />
          <Skeleton variant="circle" className="h-10 w-10" />
          <Skeleton variant="rect" className="h-16 w-full" />
          <SkeletonText lines={3} />
        </div>
        <div className="w-64 space-y-3">
          <ProgressBar value={0.35} label="Uploading" />
          <ProgressBar value={1} label="Complete" />
        </div>
        <div className="w-64 space-y-2 text-body text-primary">
          <p>
            <Highlighter text="Q3 Product Roadmap Sync" query="road" />
          </p>
          <p>
            {/* T10-E: regex metacharacters are literal. */}
            <Highlighter text="the a.*b pattern is literal" query="a.*b" />
          </p>
          <p data-testid="highlighter-script">
            {/* T10-F: markup is text. */}
            <Highlighter text='<script>alert("x")</script>' query="script" />
          </p>
          <p data-testid="highlighter-active">
            <Highlighter text="one two one two one" query="one" activeIndex={1} />
          </p>
        </div>
      </Section>

      <Section id="rows" title="MeetingRowSkeleton (must be 72px)">
        <div className="w-full">
          <MeetingRowSkeleton />
        </div>
      </Section>

      <Section id="empty" title="EmptyState">
        <div className="w-full max-w-modal-md">
          <EmptyState
            title="No meetings match your search"
            body="Try a different term, or clear the search to see everything."
            illustration={<EmptySearch />}
            action={<Button variant="primary">Clear search</Button>}
            secondaryAction={<Button variant="link">Browse all</Button>}
            testId="gallery-empty"
          />
        </div>
      </Section>

      <Section id="pagination" title="Pagination">
        <div className="w-full">
          <Pagination page={page} totalPages={12} onPageChange={setPage} />
        </div>
      </Section>

      <Section id="panels" title="ResizablePanels">
        <div className="h-48 w-full rounded-md border border-subtle">
          <ResizablePanels
            storageKey="ff.gallery.split"
            leftLabel="Transcript"
            rightLabel="Summary"
            left={<div className="h-full bg-surface-1 p-3 text-body text-secondary">Left</div>}
            right={<div className="h-full bg-surface-1 p-3 text-body text-secondary">Right</div>}
          />
        </div>
      </Section>
    </div>
  )
}
