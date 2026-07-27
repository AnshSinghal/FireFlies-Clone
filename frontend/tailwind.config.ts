import type { Config } from 'tailwindcss'

/**
 * Tailwind is configured against DESIGN TOKENS, never raw hex values.
 *
 * `theme.colors` is REPLACED, not extended. Tailwind's default palette is gone,
 * so `bg-blue-500`, `text-gray-700` and `text-white` are build errors rather
 * than silent off-palette colour. That is the single mechanism keeping the UI
 * on-palette — see docs/decisions.md ADR-002.
 *
 * Every value below resolves to a CSS custom property declared in
 * src/styles/tokens.css, which is the only file in the repo containing hex.
 * Dark mode re-points those properties; nothing here changes.
 */

const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}'],

  // Theme is driven by a data attribute set before paint (no-flash script, T-38.2),
  // not by a class, so the server-rendered HTML already carries the right theme.
  darkMode: ['selector', '[data-theme="dark"]'],

  theme: {
    // ── Colour ───────────────────────────────────────────────────────────────
    // REPLACES the default palette. Only `transparent` and `current` survive,
    // because they are colourless and always legitimate.
    colors: {
      transparent: 'transparent',
      current: 'currentColor',

      accent: {
        DEFAULT: 'var(--ff-accent)',
        hover: 'var(--ff-accent-hover)',
        pressed: 'var(--ff-accent-pressed)',
        subtle: 'var(--ff-accent-subtle)',
        border: 'var(--ff-accent-border)',
        strong: 'var(--ff-accent-strong)',
      },

      brand: {
        mark: 'var(--ff-brand-mark)',
        amber: 'var(--ff-brand-amber)',
      },

      // Assigned by hashing the speaker's name — see lib/utils/speaker-color.ts.
      speaker: {
        0: 'var(--ff-speaker-0)',
        1: 'var(--ff-speaker-1)',
        2: 'var(--ff-speaker-2)',
        3: 'var(--ff-speaker-3)',
        4: 'var(--ff-speaker-4)',
        5: 'var(--ff-speaker-5)',
        6: 'var(--ff-speaker-6)',
        7: 'var(--ff-speaker-7)',
      },

      surface: {
        0: 'var(--ff-surface-0)',
        1: 'var(--ff-surface-1)',
        2: 'var(--ff-surface-2)',
        hover: 'var(--ff-surface-hover)',
        /*
         * The buffered range on a seekbar (T-19.10) — the one fill that has to
         * sit BETWEEN the track and the played portion. Named under `surface`
         * because that is what it is, even though the value it borrows is the
         * strong border grey.
         */
        buffered: 'var(--ff-border-strong)',
      },

      // Text roles. Named at the top level so the utility reads `text-primary`
      // rather than `text-text-primary`.
      primary: 'var(--ff-text-primary)',
      secondary: 'var(--ff-text-secondary)',
      muted: 'var(--ff-text-muted)',
      inverse: 'var(--ff-text-inverse)',

      success: {
        DEFAULT: 'var(--ff-success)',
        subtle: 'var(--ff-success-subtle)',
        strong: 'var(--ff-success-strong)',
      },
      warning: {
        DEFAULT: 'var(--ff-warning)',
        subtle: 'var(--ff-warning-subtle)',
        // TEXT on the subtle background — the badge pattern. The base hue is
        // for icons and fills, where 3:1 suffices (T-38.5).
        strong: 'var(--ff-warning-strong)',
      },
      danger: {
        DEFAULT: 'var(--ff-danger)',
        subtle: 'var(--ff-danger-subtle)',
        strong: 'var(--ff-danger-strong)',
      },
      highlight: {
        DEFAULT: 'var(--ff-highlight)',
        active: 'var(--ff-highlight-active)',
      },

      /* User highlights (T-32.3): `bg-hl-amber` washes, `decoration-hl-amber-line`
         underlines. Kept flat so every class names its colour in full. */
      'hl-amber': 'var(--ff-hl-amber-bg)',
      'hl-amber-line': 'var(--ff-hl-amber-line)',
      'hl-green': 'var(--ff-hl-green-bg)',
      'hl-green-line': 'var(--ff-hl-green-line)',
      'hl-blue': 'var(--ff-hl-blue-bg)',
      'hl-blue-line': 'var(--ff-hl-blue-line)',
      'hl-pink': 'var(--ff-hl-pink-bg)',
      'hl-pink-line': 'var(--ff-hl-pink-line)',

      /* Soundbite bands on the seekbar (T-33.7). The token carries its own
         alpha, so it is used as `bg-soundbite-band` with no opacity modifier. */
      'soundbite-band': 'var(--ff-soundbite-band)',

      /* Modal backdrop. Already carries its own alpha, so it is used as
         `bg-scrim` with no opacity modifier. */
      scrim: 'var(--ff-scrim)',
    },

    /*
     * Ring colours must be set explicitly.
     *
     * Tailwind's defaults are `theme('colors.blue.500', '#3b82f6')` and
     * `'#fff'` — and because we deleted the default palette, those lookups miss
     * and fall through to the LITERAL hex, which then ships in every build as
     * `--tw-ring-color:#3b82f680`. Nothing in the app uses `ring-*` (the focus
     * ring is --ff-shadow-focus), but the raw hex would still be in the output
     * and would fail the "no hex outside tokens.css" check (T02-D).
     */
    ringColor: {
      // Must be a FUNCTION, not the string 'var(--ff-accent)'.
      // Tailwind pipes ringColor.DEFAULT through withAlphaValue() to build the
      // base `--tw-ring-color`. That helper cannot parse a CSS variable, so a
      // plain string makes it fall through to its hardcoded blue-300 literal
      // (#93c5fd80). A function is invoked directly and passes the var through.
      // The cast is needed because Tailwind's published types declare colour
      // leaves as `string`, even though the resolver invokes function values.
      DEFAULT: (() => 'var(--ff-accent)') as unknown as string,
      accent: 'var(--ff-accent)',
      danger: 'var(--ff-danger)',
      surface: 'var(--ff-surface-0)',
      transparent: 'transparent',
      current: 'currentColor',
    },

    ringOffsetColor: {
      DEFAULT: 'var(--ff-surface-0)',
      surface: 'var(--ff-surface-0)',
    },

    // Border colours are declared separately so the utility is `border-subtle`
    // instead of `border-border-subtle`.
    borderColor: {
      DEFAULT: 'var(--ff-border-subtle)',
      transparent: 'transparent',
      current: 'currentColor',
      subtle: 'var(--ff-border-subtle)',
      strong: 'var(--ff-border-strong)',
      accent: 'var(--ff-accent)',
      'accent-subtle': 'var(--ff-accent-border)',
      success: 'var(--ff-success)',
      warning: 'var(--ff-warning)',
      danger: 'var(--ff-danger)',
    },

    // ── Typography ───────────────────────────────────────────────────────────
    // REPLACES the default scale. Each entry carries size, leading, weight and
    // tracking together, so `text-transcript` is one class and not four.
    fontSize: {
      display: ['28px', { lineHeight: '36px', fontWeight: '700', letterSpacing: '-0.02em' }],
      h2: ['20px', { lineHeight: '28px', fontWeight: '600' }],
      h3: ['16px', { lineHeight: '24px', fontWeight: '600' }],
      body: ['14px', { lineHeight: '22px', fontWeight: '400' }],
      'body-strong': ['14px', { lineHeight: '22px', fontWeight: '500' }],
      'title-row': ['15px', { lineHeight: '22px', fontWeight: '600' }],
      transcript: ['15px', { lineHeight: '26px', fontWeight: '400' }],
      sm: ['13px', { lineHeight: '18px', fontWeight: '400' }],
      xs: ['12px', { lineHeight: '16px', fontWeight: '500' }],
      label: ['12px', { lineHeight: '16px', fontWeight: '600', letterSpacing: '0.04em' }],
    },

    fontFamily: {
      sans: ['var(--ff-font-sans)', 'system-ui', 'sans-serif'],
      // For values meant to be read character by character — error codes, ids.
      mono: ['var(--ff-font-mono)', 'monospace'],
    },

    // ── Shape & elevation ────────────────────────────────────────────────────
    borderRadius: {
      none: '0',
      sm: 'var(--ff-radius-sm)', //  6px — chips, badges, inputs
      md: 'var(--ff-radius-md)', //  8px — buttons, dropdown items
      lg: 'var(--ff-radius-lg)', // 12px — cards, panels, modals
      full: 'var(--ff-radius-full)',
    },

    boxShadow: {
      none: 'none',
      xs: 'var(--ff-shadow-xs)',
      sm: 'var(--ff-shadow-sm)',
      md: 'var(--ff-shadow-md)',
      lg: 'var(--ff-shadow-lg)',
      focus: 'var(--ff-shadow-focus)',
    },

    // ── Motion ───────────────────────────────────────────────────────────────
    transitionDuration: {
      DEFAULT: 'var(--ff-dur-base)',
      fast: 'var(--ff-dur-fast)', // 120ms
      base: 'var(--ff-dur-base)', // 200ms
      slow: 'var(--ff-dur-slow)', // 320ms
    },

    transitionTimingFunction: {
      DEFAULT: 'var(--ff-ease)',
      ff: 'var(--ff-ease)',
      /*
       * The one place an ease curve is WRONG: a progress fill.
       *
       * The player commits its clock ten times a second and the fill
       * transitions between commits. With an ease the bar accelerates and
       * decelerates ten times a second, which reads as stuttering rather than
       * as smoothing — the artefact the transition exists to hide.
       */
      linear: 'linear',
    },

    extend: {
      // Fixed sizes from design.md §3.7. These drive every layout test, so they
      // are named rather than sprinkled as magic numbers.
      spacing: {
        topbar: '56px',
        rail: '240px',
        'rail-collapsed': '64px',
        'icon-rail': '56px',
        /*
         * 82px, taken from the reference (T-46.1) — was 72px, the plan's value.
         *
         * Measured on `docs/reference/fireflies/02.png`, their card is short
         * against BOTH our anchors: 1.514 x their topbar where ours was 1.286,
         * and 5.658 x their row-title glyph band where ours was 5.143. No
         * single value satisfies both, because our own topbar:type ratio sits
         * 7% off theirs (4.000 vs 3.737) — their capture is not a uniform zoom
         * of ours, so the difference cannot be normalised away.
         *
         * 82 minimises the worst case: 3.3% under on the topbar anchor, 3.5%
         * over on the type anchor, against 17% and 12% short before. Anchoring
         * on either alone would have overshot the other by the full 7%.
         */
        row: '82px',

        /*
         * Notebook list rhythm, derived from `docs/reference/fireflies/02.png`
         * rather than chosen (T-46.1, ADR-149). Measured as ratios of card
         * height, because the reference was captured at a different width:
         *
         *   between cards in one date group   0.274 x card  ->  0.274 x 72 = 20px
         *   across a date-group heading       0.94  x card  ->  67px total,
         *     of which the heading and its own 8px gap supply 31 -> 36px here
         *
         * Named, not inlined, because the skeleton has to mirror them exactly
         * or the list jumps when real rows replace it.
         */
        /*
         * The settings measure, taken from the reference (docs/ui-audit.md
         * item 10). Value and reasoning are the parallel session's, from
         * commit 241177d, kept when the two implementations were reconciled.
         *
         * Fireflies constrains its settings block to 57.6% of the content
         * column and centres it — gutters equal within 3% (336px vs 345px on
         * a 1608px column). Ours was `max-w-sm`: 40.2%, flush left, 0px one
         * side and 570px the other, which reads as a page that stopped
         * rendering rather than as a designed measure.
         *
         * 548px is 57.5% of our 953px column, matching their ratio rather
         * than their pixels — the columns are different widths, so the ratio
         * is the transferable part.
         */
        settings: '548px',

        'row-gap': '20px',
        /*
         * 26/17, not 36/8. ADR-149 matched the group gap's TOTAL to the
         * reference; this matches its DISTRIBUTION, which is a separate
         * property and was still wrong. Fireflies splits the run between two
         * cards straddling a date heading 0.52 / 0.18 / 0.31 (below card /
         * heading / above next card); ours was 0.64 / 0.21 / 0.16, so the
         * heading read as attached to the card beneath it rather than sitting
         * between groups.
         *
         * Derived by holding the 67px total (that ratio is already correct at
         * 0.944 against their 0.94) and the 14px glyph band (the type scale is
         * already correct), then splitting the remaining 53px in their
         * below:above ratio. A first attempt at 28/18 pushed the total to 70px
         * and would have broken the ratio ADR-149 had just fixed.
         */
        'group-gap': '26px',
        'heading-gap': '17px',
        'btn-sm': '32px',
        'btn-md': '36px',
        'btn-lg': '40px',
        input: '40px',
        'avatar-sm': '24px',
        'avatar-md': '32px',
        'avatar-lg': '40px',
        drawer: '420px',
        panel: '380px',
        flyout: '320px',
        toast: '380px',
      },
      maxWidth: {
        content: '1440px',
        search: '560px',
        prose: '68ch',
        'modal-sm': '440px',
        'modal-md': '560px',
        'modal-lg': '720px',
      },
      zIndex: {
        topbar: '40',
        drawer: '45',
        modal: '50',
        popover: '55',
        toast: '60',
      },
    },
  },

  plugins: [],
}

export default config
