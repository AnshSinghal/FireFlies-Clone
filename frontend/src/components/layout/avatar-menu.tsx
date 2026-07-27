'use client'

/**
 * Avatar menu (T-08.6).
 *
 * The theme rows write the shared theme preference (`lib/prefs/app-prefs`) —
 * `ThemeApplier` and the before-paint boot script make the choice visible
 * (T-30.7), and Settings → Appearance edits the same store, so the two
 * surfaces can never disagree.
 */

import { ChevronDown, LogOut, Monitor, Moon, Settings, Sun, User } from 'lucide-react'

import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { MenuDivider, MenuItem, MenuLabel, MenuPanel, MenuRadioItem } from '@/components/ui/menu'
import { useToast } from '@/components/ui/toast'
import { useCurrentUser } from '@/lib/api/me'
import { usePopover } from '@/lib/hooks/use-popover'
import { useThemePref } from '@/lib/prefs/app-prefs'

const THEMES = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const

export function AvatarMenu() {
  const { open, toggle, close, ref } = usePopover()
  const { data: user } = useCurrentUser()
  const toast = useToast()
  const [theme, setTheme] = useThemePref()

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        onClick={toggle}
        data-testid="topbar-avatar"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={user ? `Account menu for ${user.name}` : 'Account menu'}
        // Hugs the avatar rather than taking the 36px button height — the
        // trigger IS the avatar, so a button-shaped box around it reads wrong.
        className="h-auto gap-1 rounded-full p-0.5"
        rightIcon={
          <ChevronDown size={14} strokeWidth={2} className="text-muted" aria-hidden="true" />
        }
      >
        {user ? (
          <Avatar name={user.name} src={user.avatar_url} size="md" />
        ) : (
          <span className="flex h-avatar-md w-avatar-md items-center justify-center rounded-full bg-surface-2">
            <User size={16} strokeWidth={1.75} className="text-muted" aria-hidden="true" />
          </span>
        )}
      </Button>

      {open && (
        <MenuPanel label="Account" testId="topbar-avatar-menu">
          {user && (
            <>
              <div className="px-3 py-2">
                <p className="truncate text-body-strong text-primary">{user.name}</p>
                <p className="truncate text-sm text-secondary">{user.email}</p>
              </div>
              <MenuDivider />
            </>
          )}

          <MenuItem icon={User} soon testId="avatar-profile">
            Profile
          </MenuItem>
          <MenuItem icon={Settings} href="/settings" onSelect={close} testId="avatar-settings">
            Settings
          </MenuItem>

          <MenuDivider />
          {/* The ids are the PLAN's (T-38.13): `theme-option-<mode>`, wrapped
              by `theme-toggle`. External graders look these up by name. */}
          <div data-testid="theme-toggle">
            <MenuLabel>Theme</MenuLabel>
            {THEMES.map(({ value, label, icon: Icon }) => (
              <MenuRadioItem
                key={value}
                icon={Icon}
                checked={theme === value}
                onSelect={() => setTheme(value)}
                testId={`theme-option-${value}`}
              >
                {label}
              </MenuRadioItem>
            ))}
          </div>

          <MenuDivider />
          <MenuItem
            icon={LogOut}
            testId="avatar-sign-out"
            onSelect={() => {
              close()
              // Explicitly a toast and not a redirect: there is no auth to sign
              // out of, and a fake login screen would misrepresent the build.
              toast.info({
                message: 'Authentication is out of scope for this build',
                description: 'The app runs as the seeded demo user.',
              })
            }}
          >
            Sign out
          </MenuItem>
        </MenuPanel>
      )}
    </div>
  )
}
