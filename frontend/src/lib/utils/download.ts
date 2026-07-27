/**
 * Browser file downloads (T-34.8).
 *
 * The app had no download path before exports — every response was JSON. A
 * download from `fetch` is three steps that must happen in order: blob →
 * object URL → synthetic anchor click. The anchor's `download` attribute names
 * the file; the object URL is revoked on a DELAY because revoking synchronously
 * can cancel a download the browser has only just started (Safari, notably).
 */

/**
 * The filename the server chose, out of `Content-Disposition`.
 *
 * Handles both shapes the header legally takes: RFC 5987 `filename*=UTF-8''…`
 * (checked first — it is the form that can carry non-ASCII) and the plain
 * quoted or bare `filename=`. Returns null when the header is missing or
 * unparseable — which includes the cross-origin dev case where the backend has
 * not CORS-exposed the header; callers supply their own fallback.
 */
export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null

  const extended = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header)?.[1]
  if (extended) {
    try {
      return decodeURIComponent(extended.trim().replace(/^"|"$/g, ''))
    } catch {
      // Malformed percent-encoding — fall through to the plain form.
    }
  }

  const plain = /filename="([^"]+)"|filename=([^;]+)/i.exec(header)
  const name = (plain?.[1] ?? plain?.[2])?.trim()
  return name || null
}

/** Long enough for any engine to have opened the stream; leaks nothing — the
 * URL dies with the timer, not with the page's memory. */
const REVOKE_DELAY_MS = 10_000

/** Hands `blob` to the browser's download UI under `filename`. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}
