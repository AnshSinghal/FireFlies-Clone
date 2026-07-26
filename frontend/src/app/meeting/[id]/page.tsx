/**
 * The Notepad route (T-18).
 *
 * A SERVER component that does one thing: validate the id and call
 * `notFound()`, so a malformed link gets the branded not-found page rather than
 * an error state from a request the API would reject anyway.
 *
 * NOTE: this renders the not-found boundary but does NOT change the HTTP status
 * — `/meeting/bogus` answers 200, because the route matched and only its
 * parameter is wrong. Verified, and recorded in `12-states.spec.ts` beside the
 * test rather than assumed. A genuinely unmatched route does return 404.
 *
 * Everything interactive lives in `NotepadView`, which is a client component.
 */

import { notFound } from 'next/navigation'

import { NotepadView } from '@/features/notepad/notepad-view'

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const meetingId = Number(id)

  // A non-numeric id was never a valid link, so the branded 404 is a better
  // answer than an error state from a request the API would reject anyway.
  if (!Number.isInteger(meetingId) || meetingId <= 0) notFound()

  return <NotepadView meetingId={meetingId} />
}
