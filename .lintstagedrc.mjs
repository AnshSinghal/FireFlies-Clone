/**
 * Pre-commit gates for a polyglot monorepo.
 *
 * Each entry is a FUNCTION rather than a command string. lint-staged appends
 * the matched filenames to a string command, which would break `make` and
 * would also mean linting a Python file with the frontend's toolchain. A
 * function ignores the file list and returns the command verbatim, so the
 * pattern acts purely as a trigger: touch a .py file, run the backend gate.
 *
 * The gates check the whole project rather than just staged files. For a repo
 * this size that costs a couple of seconds and removes an entire class of
 * "passed locally, failed in CI" surprises.
 */
export default {
  'backend/**/*.py': () => ['make lint-backend'],
  'frontend/src/**/*.{ts,tsx,css}': () => ['make lint-frontend'],
  'scripts/**/*.py': () => ['make lint-backend'],
}
