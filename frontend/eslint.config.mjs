import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import tailwind from 'eslint-plugin-tailwindcss'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

/**
 * Feature slices are islands. `features/notebook` may not import from
 * `features/notepad`, and so on — anything genuinely shared belongs in
 * `components/ui`, `lib/` or `types/`.
 *
 * Without this, "shared" helpers accrete inside whichever feature needed them
 * first and the module graph quietly becomes a ball of mud. Enforcing it
 * mechanically is what "Code Modularity" is actually graded on (T-01.7).
 */
const FEATURES = ['notebook', 'notepad', 'actions']

const crossFeatureImportRules = FEATURES.map((feature) => {
  const others = FEATURES.filter((f) => f !== feature)

  return {
    files: [`src/features/${feature}/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: others.flatMap((f) => [
                `@/features/${f}`,
                `@/features/${f}/**`,
                `../${f}`,
                `../${f}/**`,
              ]),
              message:
                'Cross-feature imports are not allowed. Lift the shared code into components/ui, lib/ or types/.',
            },
          ],
        },
      ],
    },
  }
})

/**
 * Off-palette colour enforcement (T-01.6 / test T01-C).
 *
 * Deleting Tailwind's default palette does NOT by itself make `bg-blue-500`
 * fail — Tailwind simply emits no CSS for an unknown utility, so the class sits
 * in the markup doing nothing and the colour bug ships silently.
 *
 * `no-custom-classname` is what actually closes that hole: it errors on any
 * class the Tailwind config cannot produce. Since the config only knows token
 * colours, `bg-blue-500` and `text-white` are lint errors and CI fails.
 */
const tailwindEnforcement = {
  files: ['src/**/*.{ts,tsx}'],
  plugins: { tailwindcss: tailwind },
  settings: {
    tailwindcss: {
      // Must be absolute. The plugin derives its module-resolution base from
      // dirname(config), and a relative path yields "." which fails to resolve
      // tailwindcss itself.
      config: path.join(projectRoot, 'tailwind.config.ts'),
      callees: ['clsx', 'cn', 'cva', 'twMerge'],
    },
  },
  rules: {
    'tailwindcss/no-custom-classname': [
      'error',
      // Hand-authored utilities declared in globals.css, which the plugin
      // cannot see because they are not generated from the config.
      { whitelist: ['tnum'] },
    ],
    'tailwindcss/no-contradicting-classname': 'error',
    // Ordering is prettier-plugin-tailwindcss's job; two sorters fight.
    'tailwindcss/classnames-order': 'off',
  },
}

/**
 * Raw interactive elements are banned outside `components/ui/` (T-10.18).
 *
 * The primitives carry the focus ring, the disabled treatment, the loading
 * state and the height scale. A hand-rolled `<button className="...">` in a
 * feature is how an app ends up with three button heights on one screen — and
 * it is invisible in review, because each one looks fine on its own.
 *
 * `components/ui/` is exempt: that is where the primitives are DEFINED, so it
 * necessarily contains the raw elements everything else consumes.
 */
const rawElementBan = {
  files: ['src/features/**/*.tsx', 'src/app/**/*.tsx', 'src/components/layout/**/*.tsx'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: 'JSXOpeningElement[name.name="button"]',
        message:
          'Use <Button> or <IconButton> from components/ui instead of a raw <button>. They carry the focus ring, sizes and disabled/loading states.',
      },
      {
        selector: 'JSXOpeningElement[name.name="input"]',
        message:
          'Use <Input>, <SearchInput> or <Checkbox> from components/ui instead of a raw <input>.',
      },
      {
        selector: 'JSXOpeningElement[name.name="select"]',
        message:
          'Use <Select> from components/ui. A native <select> renders with OS chrome and looks unfinished beside the custom inputs.',
      },
    ],
  },
}

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  tailwindEnforcement,
  rawElementBan,
  ...crossFeatureImportRules,

  // Routes are routes. Business logic lives in features/ and lib/ (T-01.3).
  {
    files: ['src/app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/services/**'],
              message: 'Route files compose features; they do not contain business logic.',
            },
          ],
        },
      ],
    },
  },

  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
])

export default eslintConfig
