import playwright from 'eslint-plugin-playwright'
import tseslint from 'typescript-eslint'

/**
 * Lint for the e2e suite (T-39.10).
 *
 * Two jobs: the eslint-plugin-playwright recommended set (missing awaits on
 * assertions being the one that catches real bugs), and a custom rule that
 * bans FRAGILE raw locators — class and id selectors, XPath, descendant
 * chains — while allowing the two raw forms this suite legitimately uses.
 */

/*
 * The locator grammar this suite allows in a raw `.locator(…)` call:
 *
 * 1. ATTRIBUTE SELECTORS — `[data-testid^="transcript-segment-"]`,
 *    `[data-active="true"]`, `[aria-current="page"]`. Playwright has no
 *    getByTestId prefix form, and `data-*`/`aria-*` attributes are deliberate
 *    contracts with the tests, so these are as stable as a testid.
 *
 * 2. STRUCTURAL TAGS, optionally attribute-qualified — `mark`, `li`, `body`,
 *    `a[href*="?t="]`, `mark:not([data-active="true"])`. These assert real
 *    semantics ("the highlight is a <mark>", "the link carries ?t=") that a
 *    testid would only restate. A bare tag scoped under a testid locator is
 *    the suite's normal way to reach one.
 *
 * Everything else is a bug waiting for a styling refactor to spring it:
 * `.bg-scrim` broke the moment the class was renamed-adjacent, and
 * `span.text-body-strong` couples a test to the type scale. Both kinds were
 * purged in T-39; this rule keeps them out.
 */
const COMPOUND = String.raw`(?:[a-z][a-z0-9-]*(?:\[[^\]]+\]|:not\([^)]+\))*|(?:\[[^\]]+\]|:not\([^)]+\))+)`
const ALLOWED = new RegExp(`^${COMPOUND}(?:\\s*,\\s*${COMPOUND})*$`)

const noFragileLocator = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Raw locators may use attribute selectors or structural tags only — no class/id selectors, no XPath, no combinators. Prefer getByTestId/getByRole.',
    },
    schema: [],
    messages: {
      fragile:
        'Fragile raw locator "{{selector}}". Use getByTestId/getByRole, an [data-*] attribute selector, or a plain structural tag.',
    },
  },
  create(context) {
    const check = (node, selector) => {
      if (typeof selector !== 'string' || selector.length === 0) return
      if (!ALLOWED.test(selector)) {
        context.report({ node, messageId: 'fragile', data: { selector } })
      }
    }

    return {
      CallExpression(node) {
        const { callee } = node
        if (
          callee.type !== 'MemberExpression' ||
          callee.property.type !== 'Identifier' ||
          callee.property.name !== 'locator'
        ) {
          return
        }
        const [argument] = node.arguments
        if (!argument) return

        if (argument.type === 'Literal') check(argument, argument.value)
        if (argument.type === 'TemplateLiteral') {
          // `[data-testid="action-item-due-${id}"]` — judge the static parts,
          // with a benign placeholder standing in for each interpolation.
          check(argument, argument.quasis.map((quasi) => quasi.value.cooked ?? '').join('x'))
        }
      },
    }
  },
}

export default [
  {
    ignores: [
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      // The docs screenshot harness, not a test suite: it skips itself in a
      // normal run and deliberately waits for network idle before capturing.
      // Test-shaped rules judge it by standards it does not claim to meet.
      'tests/99-capture.spec.ts',
    ],
  },
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: {
      playwright,
      e2e: { rules: { 'no-fragile-locator': noFragileLocator } },
    },
    rules: {
      ...playwright.configs['flat/recommended'].rules,

      'e2e/no-fragile-locator': 'error',

      /*
       * Recommended rules this suite deliberately relaxes — each one because
       * an established, reasoned pattern in the existing specs violates it,
       * not because the rule is wrong in general.
       */
      // Loops over viewports/cells and `if (wait > 0)` pacing are idiomatic
      // here; the determinism worry the rule guards against is handled by the
      // seeded database instead.
      'playwright/no-conditional-in-test': 'off',
      // Same pattern: expects inside those loops.
      'playwright/no-conditional-expect': 'off',
      // `12-states` polls a skeleton at fixed offsets on purpose — the waits
      // ARE the test. Warn, so a lazy sleep in new code still gets flagged in
      // review without failing the build on the legitimate cases.
      'playwright/no-wait-for-timeout': 'warn',
      // Helper functions own assertions (`openTranscript` asserts visibility);
      // the rule cannot see through them.
      'playwright/expect-expect': 'off',
      // `expect.poll(...).toBe(...)` on plain values, per the sync suite.
      'playwright/prefer-web-first-assertions': 'warn',
    },
  },
  {
    // The infra files are not tests; the test-shaped rules do not apply.
    files: ['*.ts', 'pages/**/*.ts'],
    rules: {
      'playwright/no-standalone-expect': 'off',
    },
  },
]
