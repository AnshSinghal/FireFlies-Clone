/**
 * Typed fetch wrapper (T-06.4).
 *
 * One place that knows how to talk to the API, so every caller gets the same
 * treatment: JSON encoding, the error envelope unwrapped into a typed
 * exception, an abort signal, and a timeout.
 *
 * The timeout matters more than it looks. Without one, a request to a sleeping
 * free-tier backend hangs until the browser gives up — around two minutes — and
 * the UI shows a spinner the whole time with no way to recover.
 */

import type { ErrorResponse } from './types'

/** 15s. Long enough for a cold start, short enough to fail before a user does. */
const DEFAULT_TIMEOUT_MS = 15_000

/**
 * Resolved once at module load. `NEXT_PUBLIC_*` is inlined at build time, so
 * reading it per request buys nothing and hides the failure — an empty base URL
 * produces requests to the Next server that 404 confusingly.
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

/**
 * A failed request, carrying the backend's error envelope.
 *
 * `code` is what callers branch on — it is stable, unlike `message`, which is
 * for humans and will be reworded (see docs/api.md).
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: Record<string, unknown>

  constructor(status: number, code: string, message: string, details: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }

  /** True for the cases where retrying could plausibly succeed. */
  get isRetryable(): boolean {
    return this.status >= 500 || this.status === 429
  }

  /** A soft-deleted resource — restorable, so the UI can offer that. */
  get isGone(): boolean {
    return this.status === 410
  }

  get isNotFound(): boolean {
    return this.status === 404
  }

  /** Field-level messages from a 422, keyed by dotted path. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [field, message] of Object.entries(this.details)) {
      if (typeof message === 'string') out[field] = message
    }
    return out
  }
}

/** The request never left, or never came back. Distinct from an API error. */
export class NetworkError extends Error {
  readonly cause?: unknown

  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'NetworkError'
    this.cause = cause
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  /** Serialised as JSON; set `Content-Type` automatically. */
  body?: unknown
  /** Appended as a query string, skipping null and undefined. */
  params?: RequestParams
  timeoutMs?: number
}

/** Everything a query string can carry. Arrays become repeated params. */
export type RequestParams = Record<string, string | number | boolean | undefined | null | string[]>

function buildUrl(path: string, params: RequestOptions['params']): string {
  const url = new URL(path.startsWith('/') ? path : `/${path}`, API_BASE_URL)

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === '') continue
    // Arrays become repeated params (?tag=a&tag=b) rather than a JSON blob,
    // so the URL stays readable and shareable (T-13.8).
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, item)
    } else {
      url.searchParams.set(key, String(value))
    }
  }

  return url.toString()
}

async function toApiError(response: Response): Promise<ApiError> {
  let code = 'UNKNOWN'
  let message = response.statusText || 'Request failed'
  let details: Record<string, unknown> = {}

  try {
    const body = (await response.json()) as Partial<ErrorResponse>
    if (body.error) {
      code = body.error.code ?? code
      message = body.error.message ?? message
      details = (body.error.details as Record<string, unknown>) ?? {}
    }
  } catch {
    // A non-JSON error body — a proxy 502, an HTML error page. The status is
    // still meaningful, so fall through with what we have rather than throwing
    // a parse error that hides the real failure.
  }

  return new ApiError(response.status, code, message, details)
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, params, timeoutMs = DEFAULT_TIMEOUT_MS, headers, signal, ...rest } = options

  const url = buildUrl(path, params)
  const timeoutController = new AbortController()
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs)

  // Two abort sources — the caller's (a component unmounting, TanStack Query
  // cancelling) and ours. `AbortSignal.any` honours whichever fires first.
  const composedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal

  try {
    const response = await fetch(url, {
      ...rest,
      signal: composedSignal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })

    if (!response.ok) throw await toApiError(response)

    // 204 and friends have no body; calling .json() on them throws.
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return undefined as T
    }

    return (await response.json()) as T
  } catch (error) {
    if (error instanceof ApiError) throw error

    // A caller-initiated abort is not a failure — it means the component went
    // away. Rethrow it as-is so TanStack Query recognises the cancellation
    // rather than surfacing an error toast for a navigation.
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (signal?.aborted) throw error
      throw new NetworkError(`Request timed out after ${timeoutMs}ms`, error)
    }

    throw new NetworkError('Could not reach the server. Check your connection.', error)
  } finally {
    clearTimeout(timer)
  }
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'DELETE' }),
}
