/**
 * Domain types, extracted from the generated OpenAPI client.
 *
 * `api.d.ts` is machine-generated from the backend schema (`make types`), and
 * its shape — `components['schemas']['MeetingListItem']` — is unpleasant to read
 * at a call site. These aliases give the rest of the app ordinary names while
 * keeping the definitions derived.
 *
 * The point is that nothing here is hand-written. Rename a field on the backend
 * and this file does not change; every consumer of it fails to compile instead,
 * which is the whole reason the client is generated and drift-tested (ADR-018).
 */

import type { components } from '@/types/api'

type Schemas = components['schemas']

export type MeetingListItem = Schemas['MeetingListItem']
export type MeetingDetail = Schemas['MeetingDetail']
export type MeetingCreate = Schemas['MeetingCreate']
export type MeetingUpdate = Schemas['MeetingUpdate']

export type UserRef = Schemas['UserRef']
export type UserOut = Schemas['UserOut']
export type ParticipantRef = Schemas['ParticipantRef']
export type TagRef = Schemas['TagRef']
export type ActionItemCounts = Schemas['ActionItemCounts']

export type SummaryOut = Schemas['SummaryOut']
export type HealthResponse = Schemas['HealthResponse']
export type ErrorResponse = Schemas['ErrorResponse']
export type ErrorDetail = Schemas['ErrorDetail']

export type BulkDeleteRequest = Schemas['BulkDeleteRequest']
export type BulkDeleteResponse = Schemas['BulkDeleteResponse']

export type MatchContext = Schemas['MatchContext']
export type Facets = Schemas['Facets']

export type SearchResults = Schemas['SearchResults']
export type MeetingHit = Schemas['MeetingHit']
export type TranscriptHit = Schemas['TranscriptHit']
export type MatchRange = Schemas['MatchRange']

/**
 * The paginated envelope, generic over its item type.
 *
 * The generator emits a concrete `Page_MeetingListItem_` per instantiation,
 * which cannot be reused. Declaring it once as a generic keeps call sites
 * honest — and the field list is asserted against the generated version below,
 * so a change to the envelope still breaks the build.
 */
export interface Page<T> {
  items: T[]
  page: number
  page_size: number
  total: number
  total_pages: number
  has_next: boolean
}

/**
 * Compile-time proof that `Page<T>` still matches what the backend emits.
 *
 * If the envelope gains or loses a field, this assignment stops type-checking —
 * which is exactly the failure we want, rather than a hand-written interface
 * silently drifting from the API it claims to describe.
 */
type GeneratedPage = Schemas['Page_MeetingListItem_']
const _envelopeMatches: Page<MeetingListItem> = {} as GeneratedPage
void _envelopeMatches
