'use client'

/**
 * Export downloads (T-34.8, T-34.9).
 *
 * NOT built on `apiFetch` — that wrapper sends `Accept: application/json` and
 * unconditionally parses the body as JSON, which a PDF is not. This module owns
 * the one non-JSON corner of the API: a raw fetch with the same base-URL
 * resolution and error-envelope handling as the client, ending in a browser
 * download instead of a parsed body.
 */

import { filenameFromDisposition, saveBlob } from '@/lib/utils/download'

import { API_BASE_URL, ApiError, NetworkError, toApiError } from './client'

export type ExportFormat = 'pdf' | 'md' | 'txt' | 'docx'

/**
 * A minute per export, not the client's usual 15s: a 1,200-segment PDF through
 * a real renderer legitimately outlives an API read, and T-34.8's answer to a
 * slow export is feedback (the modal's "still working" line at 10s), not a
 * premature abort.
 */
const EXPORT_TIMEOUT_MS = 60_000

/**
 * Same empty-string rule as `client.ts`: production sets NEXT_PUBLIC_API_URL=""
 * meaning "this page's origin" (nginx routes /api), and `new URL(path, '')`
 * throws — found live in T-44. Exports only ever run from a click, so `window`
 * always exists here; no SSR branch needed.
 */
function resolveBase(): string {
  return API_BASE_URL !== '' ? API_BASE_URL : window.location.origin
}

export function meetingExportUrl(
  meetingId: number,
  format: ExportFormat,
  include: readonly string[],
): string {
  const url = new URL(`/api/v1/meetings/${meetingId}/export`, resolveBase())
  url.searchParams.set('format', format)
  url.searchParams.set('include', include.join(','))
  return url.toString()
}

/** The bulk zip (T-34.9): one file per selected meeting, same format for all. */
export function bulkExportUrl(
  ids: readonly number[],
  format: ExportFormat,
  include: readonly string[],
): string {
  const url = new URL('/api/v1/meetings/export', resolveBase())
  url.searchParams.set('ids', ids.join(','))
  url.searchParams.set('format', format)
  url.searchParams.set('include', include.join(','))
  return url.toString()
}

/**
 * Client-side mirror of the server's T-34.11 sanitiser, for the FALLBACK name
 * only. The server's Content-Disposition is authoritative; this covers the
 * cross-origin dev setup where that header is not CORS-exposed and so reads as
 * null. `download` is a hint to the browser, so a mismatch is cosmetic.
 */
export function fallbackExportFilename(
  title: string,
  startedAt: string,
  format: ExportFormat,
): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
  return `${slug || 'meeting'}-${startedAt.slice(0, 10)}.${format}`
}

/**
 * Fetches `url`, hands the bytes to the browser's download UI, and resolves to
 * the filename used. Throws `ApiError` (the backend's envelope, unwrapped) or
 * `NetworkError` — and the CALLER owns the failure toast: a raw fetch is not a
 * mutation, so the global MutationCache handler never sees it.
 */
export async function downloadExport(url: string, fallbackFilename: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), EXPORT_TIMEOUT_MS)

  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw await toApiError(response)

    const blob = await response.blob()
    const filename =
      filenameFromDisposition(response.headers.get('content-disposition')) ?? fallbackFilename

    saveBlob(blob, filename)
    return filename
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new NetworkError(`Export timed out after ${EXPORT_TIMEOUT_MS / 1000}s`, error)
    }
    throw new NetworkError('Could not reach the server. Check your connection.', error)
  } finally {
    clearTimeout(timer)
  }
}
