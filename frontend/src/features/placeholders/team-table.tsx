'use client'

/**
 * Members table (T-30.4).
 *
 * Real seeded users from GET /users, not hardcoded names — the point of the
 * placeholder is showing the product surface over the app's actual data.
 * `Invite` and `Manage roles` explain themselves via the coming-soon toast
 * instead of being dead pixels.
 */

import { ShieldCheck } from 'lucide-react'

import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/chip'
import { Skeleton } from '@/components/ui/skeleton'
import { StateView } from '@/components/ui/state-view'
import { useToast } from '@/components/ui/toast'
import { useMembers } from '@/lib/api/users'
import { TOAST_MESSAGES } from '@/lib/toast/messages'

export function TeamTable() {
  const toast = useToast()
  const { data, isPending, isError, refetch } = useMembers()
  const comingSoon = () => toast.info({ message: TOAST_MESSAGES.comingSoon })

  if (isPending) {
    return (
      <div data-testid="team-table-loading">
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    )
  }
  if (isError) {
    return (
      <StateView
        variant="error"
        title="Couldn't load members"
        body="The workspace list didn't come back."
        action={<Button onClick={() => void refetch()}>Retry</Button>}
        testId="team-table-error"
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="secondary"
          size="sm"
          aria-disabled="true"
          className="text-muted"
          data-testid="team-invite-button"
          onClick={comingSoon}
        >
          Invite
        </Button>
        <Button
          variant="secondary"
          size="sm"
          aria-disabled="true"
          className="text-muted"
          data-testid="team-manage-roles-button"
          onClick={comingSoon}
        >
          Manage roles
        </Button>
      </div>

      <table className="w-full border-collapse text-left" data-testid="team-members-table">
        <thead>
          <tr className="border-b border-subtle text-sm text-muted">
            <th scope="col" className="py-2 pr-4 font-medium">
              Member
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Role
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Meetings hosted
            </th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((member) => (
            <tr
              key={member.id}
              data-testid={`team-member-${member.id}`}
              className="border-b border-subtle last:border-0"
            >
              <td className="flex items-center gap-3 py-3 pr-4">
                <Avatar name={member.name} src={member.avatar_url} size="sm" />
                <span className="text-body text-primary">{member.name}</span>
              </td>
              <td className="py-3 pr-4">
                <Badge variant={member.role === 'Admin' ? 'accent' : 'neutral'}>
                  {member.role === 'Admin' && (
                    <ShieldCheck size={12} strokeWidth={1.75} aria-hidden="true" />
                  )}
                  {member.role}
                </Badge>
              </td>
              <td className="tnum py-3 text-right text-body text-secondary">
                {member.meetings_hosted}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="rounded-lg border border-subtle bg-surface-2 px-4 py-3 text-sm text-muted">
        <span className="font-semibold">Sharing &amp; permissions:</span> in the real product,
        admins set per-meeting visibility — private to the host, shared with the team, or open
        by link. Every meeting in this build is visible to the seeded workspace.
      </p>
    </div>
  )
}
