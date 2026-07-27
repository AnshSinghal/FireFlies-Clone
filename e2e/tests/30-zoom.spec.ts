import { expect, test } from "../fixtures";
import { NotebookPage, NotepadPage } from "../pages";

/**
 * 200% zoom and reduced motion (T-42.13, case T42-H).
 *
 * Browser zoom is emulated by HALVING THE VIEWPORT, not by setting a CSS
 * transform or `document.body.style.zoom`. At 200% the browser reports half as
 * many CSS pixels to the page, which is exactly what a 720×450 viewport does —
 * and unlike a transform it exercises the real media queries, so a layout that
 * only survives zoom because its breakpoints never fired is caught here.
 *
 * WCAG 1.4.10 (reflow) is the standard behind the assertions: at 320 CSS px
 * wide, content must not require scrolling in two directions. The practical
 * form of that is the one asserted below — the document must never be wider
 * than the viewport.
 */

/** 1440×900 at 200% zoom. */
const ZOOM_200 = { width: 720, height: 450 };

/** 1440×900 at 400% zoom — the WCAG reflow floor, and the harshest case. */
const ZOOM_400 = { width: 360, height: 225 };

/**
 * How far the document may exceed the viewport before it counts as a
 * horizontal scrollbar.
 *
 * One pixel, not zero: sub-pixel layout rounding routinely leaves
 * `scrollWidth` a fraction over `clientWidth` on an element that visually fits,
 * and a zero-tolerance assertion fails on rounding rather than on overflow.
 */
const OVERFLOW_TOLERANCE = 1;

async function horizontalOverflow(
  page: import("@playwright/test").Page,
): Promise<number> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
}

/**
 * Elements whose own box spills past the viewport's right edge.
 *
 * Reported with their test ids so a failure names the culprit instead of just
 * asserting that something, somewhere, is too wide.
 */
async function clippedElements(
  page: import("@playwright/test").Page,
): Promise<string[]> {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    const offenders: string[] = [];

    for (const element of document.querySelectorAll<HTMLElement>(
      "[data-testid]",
    )) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      // Deliberately off-canvas things — a closed drawer, an sr-only label —
      // are not clipping; they are hidden, which is a different intent.
      if (getComputedStyle(element).visibility === "hidden") continue;
      if (box.right > limit + 2) {
        offenders.push(
          `${element.dataset.testid} (right ${Math.round(box.right)} > ${limit})`,
        );
      }
    }
    return offenders;
  });
}

test.describe("zoom · reflow at 200% and 400%", () => {
  test("T42-H · the notebook reflows at 200% without a horizontal scrollbar", async ({
    page,
  }) => {
    await page.setViewportSize(ZOOM_200);
    const notebook = new NotebookPage(page);
    await notebook.goto();
    await expect(notebook.list).toBeVisible();

    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(
      OVERFLOW_TOLERANCE,
    );
    expect(await clippedElements(page)).toEqual([]);
  });

  test("T42-H · the notepad reflows at 200% without a horizontal scrollbar", async ({
    page,
  }) => {
    await page.setViewportSize(ZOOM_200);
    const notepad = new NotepadPage(page);
    await notepad.goto(1);

    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(
      OVERFLOW_TOLERANCE,
    );
    expect(await clippedElements(page)).toEqual([]);
  });

  test("T42-H · the notebook still reflows at 400%, the WCAG floor", async ({
    page,
  }) => {
    await page.setViewportSize(ZOOM_400);
    const notebook = new NotebookPage(page);
    await notebook.goto();

    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(
      OVERFLOW_TOLERANCE,
    );
  });

  test("meeting titles stay readable at 200% rather than collapsing to an ellipsis", async ({
    page,
  }) => {
    /*
     * Reflow is not enough on its own: a layout can "fit" by truncating every
     * title to three characters. The rows carry a real amount of their title
     * at half the width, or the page has reflowed into uselessness.
     */
    await page.setViewportSize(ZOOM_200);
    const notebook = new NotebookPage(page);
    await notebook.goto();

    const title = await notebook.rowTitles.first().innerText();
    expect(title.replace("…", "").trim().length).toBeGreaterThan(8);
  });

  test("the topbar and rail do not overlap the content at 200%", async ({
    page,
  }) => {
    await page.setViewportSize(ZOOM_200);
    const notebook = new NotebookPage(page);
    await notebook.goto();

    const header = await page.getByTestId("topbar").boundingBox();
    const list = await page.getByTestId("meeting-list").boundingBox();

    // The list starts below the topbar. An overlap here is the classic
    // fixed-header bug, and it hides the first row.
    expect(list!.y).toBeGreaterThanOrEqual(header!.y + header!.height - 1);
  });
});

test.describe("reduced motion · the app-level surfaces", () => {
  test("the notepad honours reduced motion on its transitioning surfaces", async ({
    page,
  }) => {
    /*
     * `emulateMedia`, not `test.use({ reducedMotion })` — the project-level
     * `use` in playwright.config.ts wins over a file-level one, so the media
     * query would never match and the test would assert nothing (the same trap
     * `07-primitives` documents).
     */
    await page.emulateMedia({ reducedMotion: "reduce" });
    const notepad = new NotepadPage(page);
    await notepad.goto(1);

    const matches = await page.evaluate(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    expect(matches, "reduced-motion emulation did not take").toBe(true);

    /*
     * Every transition is collapsed, so nothing is left parked mid-animation.
     *
     * Compared in SECONDS rather than against the literal `0.01ms` the
     * stylesheet writes: `getComputedStyle` normalises the unit, and a
     * multi-property transition reports a comma-separated list. Parsing to a
     * number asserts the thing that matters — no transition still runs for a
     * perceptible time — instead of pinning a serialisation format.
     */
    const slowest = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("[data-testid]")]
        .flatMap((el) =>
          getComputedStyle(el).transitionDuration.split(",    ".trim()),
        )
        .map((value) => {
          const trimmed = value.trim();
          if (trimmed.endsWith("ms")) return Number.parseFloat(trimmed) / 1000;
          return Number.parseFloat(trimmed) || 0;
        })
        .reduce((max, seconds) => Math.max(max, seconds), 0),
    );

    // 1ms: comfortably above the 0.01ms the rule writes, far below anything a
    // person could see.
    expect(slowest).toBeLessThan(0.001);
  });
});
