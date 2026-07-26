'use client'

/**
 * Avatar menu (T-08.6).
 *
 * The theme rows record a preference and nothing else — T-38 adds the
 * `data-theme` switch and the no-flash script that make them visible. They are
 * here rather than deferred because the menu's shape (a submenu, not three flat
 * rows) is what T-38 has to fit into.
 */

import { ChevronDown, LogOut, Monitor, Moon, Settings, Sun, User } from 'lucide-react'

import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { MenuDivider, MenuItem, MenuLabel, MenuPanel, MenuRadioItem } from '@/components/ui/menu'
import { useToast } from '@/components/ui/toast'
import { useCurrentUser } from '@/lib/api/me'
import { useLocalStorage } from '@/lib/hooks/use-local-storage'
import { usePopover } from '@/lib/hooks/use-popover'

export const THEME_KEY = 'ff.theme'

export type ThemePreference = 'light' | 'dark' | 'system'

const THEMES = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const

export function AvatarMenu() {
  const { open, toggle, close, ref } = usePopover()
  const { data: user } = useCurrentUser()
  const toast = useToast()
  const { value: theme, setValue: setTheme } = useLocalStorage<ThemePreference>(THEME_KEY, 'system')

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
          <MenuLabel>Theme</MenuLabel>
          {THEMES.map(({ value, label, icon: Icon }) => (
            <MenuRadioItem
              key={value}
              icon={Icon}
              checked={theme === value}
              onSelect={() => setTheme(value)}
              testId={`avatar-theme-${value}`}
            >
              {label}
            </MenuRadioItem>
          ))}

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
