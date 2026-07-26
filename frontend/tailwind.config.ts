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
      },
      danger: {
        DEFAULT: 'var(--ff-danger)',
        subtle: 'var(--ff-danger-subtle)',
      },
      highlight: {
        DEFAULT: 'var(--ff-highlight)',
        active: 'var(--ff-highlight-active)',
      },

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
    },

    extend: {
      // Fixed sizes from design.md §3.7. These drive every layout test, so they
      // are named rather than sprinkled as magic numbers.
      spacing: {
        topbar: '56px',
        rail: '240px',
        'rail-collapsed': '64px',
        'icon-rail': '56px',
        row: '72px',
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
