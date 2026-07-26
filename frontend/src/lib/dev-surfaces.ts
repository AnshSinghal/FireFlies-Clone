/**
 * Whether the `/dev/*` surfaces are reachable.
 *
 * They are development and TEST tooling — the token sheet, the component
 * gallery, the toast harness — and must not be part of the shipped app.
 *
 * Gated on an explicit flag rather than on `NODE_ENV === 'development'`,
 * because the e2e suite runs against a PRODUCTION build (see
 * playwright.config.ts) and those surfaces are exactly what several of its
 * specs exercise. Tying the gate to NODE_ENV meant "the pages exist only where
 * we do not test them".
 *
 * A real deployment sets neither, so they stay closed.
 */
export const DEV_SURFACES_ENABLED =
  process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_ENABLE_DEV_SURFACES === 'true'
