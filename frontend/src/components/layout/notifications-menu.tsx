'use client'

/**
 * Notifications (T-08.7).
 *
 * Entirely client-side and deliberately so: the assignment asks for the
 * notification *experience*, and a real feed would need a push channel this
 * build has no room for. The three items are fixed; only their read state is
 * stored, in localStorage.
 */

import { Bell, CheckCheck, FileText, Sparkles, UserPlus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { MenuPanel } from '@/components/ui/menu'
import { useLocalStorage } from '@/lib/hooks/use-local-storage'
import { usePopover } from '@/lib/hooks/use-popover'

export const NOTIFICATIONS_READ_KEY = 'ff.notifications.read'

interface MockNotification {
  id: string
  icon: typeof Bell
  title: string
  body: string
  /** Pre-rendered rather than computed: these are fixtures, not events with real timestamps. */
  when: string
}

const NOTIFICATIONS: readonly MockNotification[] = [
  {
    id: 'summary-ready',
    icon: Sparkles,
    title: 'Summary ready',
    body: 'Q3 Product Roadmap Sync has been summarized.',
    when: '12m ago',
  },
  {
    id: 'mentioned',
    icon: UserPlus,
    title: 'You were mentioned',
    body: 'Priya Raghunathan mentioned you in Customer Discovery — Northwind.',
    when: '3h ago',
  },
  {
    id: 'transcript-shared',
    icon: FileText,
    title: 'Transcript shared',
    body: 'Marcus Bell shared Weekly Engineering Standup with you.',
    when: 'Yesterday',
  },
]

export function NotificationsMenu() {
  const { open, toggle, ref } = usePopover()
  const { value: readIds, setValue: setReadIds } = useLocalStorage<string[]>(
    NOTIFICATIONS_READ_KEY,
    [],
  )

  const unread = NOTIFICATIONS.filter((n) => !readIds.includes(n.id))

  return (
    <div ref={ref} className="relative">
      <IconButton
        onClick={toggle}
        data-testid="topbar-notifications"
        aria-haspopup="menu"
        aria-expanded={open}
        label={
          unread.length > 0 ? `Notifications, ${unread.length} unread` : 'Notifications, all read'
        }
        className="relative"
        icon={
          <>
            <Bell size={18} strokeWidth={1.75} />
            {unread.length > 0 && (
              // Decorative — the count is already in the button's label, and a
              // screen reader announcing "bullet" adds nothing.
              <span
                data-testid="topbar-notifications-dot"
                aria-hidden="true"
                className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border border-subtle bg-danger"
              />
            )}
          </>
        }
      />

      {open && (
        <MenuPanel label="Notifications" testId="topbar-notifications-menu">
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="text-h3 text-primary">Notifications</span>
            <Button
              variant="link"
              size="sm"
              onClick={() => setReadIds(NOTIFICATIONS.map((n) => n.id))}
              disabled={unread.length === 0}
              data-testid="notifications-mark-all"
              leftIcon={<CheckCheck size={14} strokeWidth={1.75} />}
              className="text-xs"
            >
              Mark all as read
            </Button>
          </div>
          <hr className="border-t border-subtle" role="separator" />

          <ul>
            {NOTIFICATIONS.map((notification) => {
              const isUnread = !readIds.includes(notification.id)
              const Icon = notification.icon
              return (
                <li
                  key={notification.id}
                  data-testid={`notification-${notification.id}`}
                  data-unread={isUnread}
                  className="flex items-start gap-2.5 px-3 py-2.5"
                >
                  <Icon
                    size={16}
                    strokeWidth={1.75}
                    className="mt-0.5 shrink-0 text-muted"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-body-strong text-primary">{notification.title}</p>
                    <p className="mt-0.5 text-sm text-secondary">{notification.body}</p>
                    <p className="mt-1 text-xs text-muted">{notification.when}</p>
                  </div>
                  {isUnread && (
                    <span
                      aria-hidden="true"
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent"
                    />
                  )}
                </li>
              )
            })}
          </ul>
        </MenuPanel>
      )}
    </div>
  )
}
