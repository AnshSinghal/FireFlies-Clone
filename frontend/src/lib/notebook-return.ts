/**
 * Where the Notepad's Back button goes (T-18.2).
 *
 * The Notebook's filters live in its query string, so returning to a bare
 * `/notebook` silently discards the user's filtered view — they came from a
 * list of four meetings and land on all forty-seven.
 *
 * `sessionStorage` rather than a query parameter, because it is UI memory
 * rather than part of the Notepad's address: `?return=%2Fnotebook%3Fhost%3D...`
 * in every meeting URL would make every shared link carry someone else's
 * filters.
 *
 * It lives in `lib/` and not in either feature because BOTH write and read it,
 * and the cross-feature import rule (T-01.7) correctly refuses to let one reach
 * into the other.
 */

export const RETURN_KEY = 'ff.notebook.return'

export function rememberNotebookUrl(url: string): void {
  try {
    sessionStorage.setItem(RETURN_KEY, url)
  } catch {
    // Private browsing, or storage full. Back still works; it just forgets.
  }
}

export function notebookReturnUrl(): string {
  try {
    return sessionStorage.getItem(RETURN_KEY) || '/notebook'
  } catch {
    return '/notebook'
  }
}
