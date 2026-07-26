import { redirect } from 'next/navigation'

/**
 * `/` redirects to the Notebook (design.md §1).
 *
 * Real Fireflies has a Home dashboard — greeting, daily brief, upcoming
 * meetings. It is out of scope here, and an empty welcome screen would be worse
 * than landing somewhere useful. The redirect is documented in the README as a
 * deliberate substitution, and "Home" is absent from the rail rather than
 * present and permanently inert.
 */
export default function RootPage() {
  redirect('/notebook')
}
