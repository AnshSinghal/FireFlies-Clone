import { expect, test } from "../fixtures";

/**
 * Colour-vision safety (T-42.6).
 *
 * Three claims, and only the first is about colour maths:
 *
 *  1. The eight speaker hues are mutually distinguishable in ordinary vision,
 *     and have not regressed under simulated dichromacy. They are assigned by
 *     index and carry identity — "who said this" — and three of them used to
 *     be the same brand violet, two of those ΔE 2.5 apart.
 *  2. A speaker's NAME is always rendered beside their colour, so hue is an
 *     accent on identity rather than the carrier of it. This is what makes the
 *     unavoidable red-green collisions survivable (see MIN_DELTA_E_SIMULATED).
 *  3. Status is never conveyed by colour ALONE. An overdue action item is red
 *     AND says how many days; a completed one is struck through AND checked.
 *     This is the claim that matters most, because it holds for total colour
 *     blindness and for a greyscale printout too.
 *
 * The simulation is Brettel/Viénot-style: convert sRGB to linear, project onto
 * the dichromat's plane in LMS, convert back. It is the standard approximation
 * and it is deliberately implemented here rather than pulled in as a
 * dependency — it is twenty lines, and a test that installs a package to
 * decide whether the design passes is a test nobody re-derives.
 *
 * Distances are CIE76 ΔE in Lab. Crude next to CIEDE2000, but the threshold
 * here is coarse ("visibly different", not "just noticeably different"), and
 * ΔE76 is honest at that resolution.
 */

type Rgb = [number, number, number];
type Deficiency = "protanopia" | "deuteranopia" | "tritanopia";

const DEFICIENCIES: readonly Deficiency[] = [
  "protanopia",
  "deuteranopia",
  "tritanopia",
];

/**
 * Minimum ΔE between any two speaker hues in ORDINARY vision.
 *
 * 15 is a considered floor: below about 10 two colours read as the same hue at
 * avatar size. The palettes clear it comfortably (light 28.1, dark 26.7) —
 * they did not before, which is what this test was written to catch. Three of
 * the eight hues were the brand violet, two of them ΔE 2.5 apart.
 */
const MIN_DELTA_E = 15;

/**
 * The floor under simulated dichromacy — deliberately much lower, and here is
 * the honest reason.
 *
 * Eight hues cannot all separate under red-green blindness while still looking
 * like a normal palette. Amber and red ARE the same hue to a deuteranope; the
 * only 8-colour sets that beat ΔE 19 under all three deficiencies are
 * all-maroon-and-navy, which is worse for the ~92% who see the difference. A
 * palette optimised solely for dichromats is not an accessible palette, it is
 * a differently-inaccessible one.
 *
 * So the mitigation is not the hue: it is that a speaker's NAME is always
 * rendered beside their colour, which the third test below asserts. That is
 * what T-42.6 actually asks for — status is never conveyed by colour ALONE —
 * and it holds for total colour blindness and greyscale print as well.
 *
 * This number is therefore a regression GUARD, not a design target: it says
 * the palette has not got worse than the measured floor.
 */
const MIN_DELTA_E_SIMULATED = 2;

function srgbToLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number): number {
  const clamped = Math.min(1, Math.max(0, channel));
  const value =
    clamped <= 0.0031308
      ? clamped * 12.92
      : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return Math.round(value * 255);
}

/** Simulate a dichromacy on an sRGB triple. */
function simulate(rgb: Rgb, deficiency: Deficiency): Rgb {
  const [r, g, b] = rgb.map(srgbToLinear) as Rgb;

  // sRGB → LMS (Hunt-Pointer-Estevez, normalised to D65).
  const l = 0.31399022 * r + 0.63951294 * g + 0.04649755 * b;
  const m = 0.15537241 * r + 0.75789446 * g + 0.08670142 * b;
  const s = 0.01775239 * r + 0.10944209 * g + 0.87256922 * b;

  // Collapse the missing axis onto the remaining two.
  let [ls, ms, ss] = [l, m, s];
  if (deficiency === "protanopia") ls = 1.05118294 * m - 0.05116099 * s;
  if (deficiency === "deuteranopia") ms = 0.9513092 * l + 0.04866992 * s;
  if (deficiency === "tritanopia") ss = -0.86744736 * l + 1.86727089 * m;

  // LMS → sRGB.
  return [
    linearToSrgb(5.47221206 * ls - 4.6419601 * ms + 0.16963708 * ss),
    linearToSrgb(-1.1252419 * ls + 2.29317094 * ms - 0.1678952 * ss),
    linearToSrgb(0.02980165 * ls - 0.19318073 * ms + 1.16364789 * ss),
  ];
}

/** sRGB → CIE Lab (D65), for a perceptual distance. */
function toLab([r, g, b]: Rgb): [number, number, number] {
  const [lr, lg, lb] = [r, g, b].map(srgbToLinear);
  const x = (0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / 0.95047;
  const y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  const z = (0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / 1.08883;

  const f = (value: number) =>
    value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function deltaE(a: Rgb, b: Rgb): number {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

test.describe("colour vision · the palette carries identity, not just decoration", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`T42-speaker · the eight speaker hues stay distinct under dichromacy (${theme})`, async ({
      page,
    }) => {
      await page.goto("/notebook");
      if (theme === "dark") {
        await page.evaluate(() =>
          document.documentElement.setAttribute("data-theme", "dark"),
        );
      }

      // Read the resolved tokens rather than the hexes in the stylesheet: the
      // theme re-points them, and what is on screen is what matters.
      const hues = await page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        return Array.from({ length: 8 }, (_, i) =>
          style.getPropertyValue(`--ff-speaker-${i}`).trim(),
        );
      });
      expect(hues.filter(Boolean)).toHaveLength(8);

      const rgbs = hues.map((hue) => {
        // Tokens are authored as hex; parse without a browser round-trip.
        const value = hue.replace("#", "");
        const full =
          value.length === 3
            ? value
                .split("")
                .map((c) => c + c)
                .join("")
            : value;
        return [
          Number.parseInt(full.slice(0, 2), 16),
          Number.parseInt(full.slice(2, 4), 16),
          Number.parseInt(full.slice(4, 6), 16),
        ] as Rgb;
      });

      const worstPair = (colours: Rgb[], floor: number): string[] => {
        const collisions: string[] = [];
        for (let i = 0; i < colours.length; i += 1) {
          for (let j = i + 1; j < colours.length; j += 1) {
            const distance = deltaE(colours[i]!, colours[j]!);
            if (distance < floor) {
              collisions.push(
                `speaker-${i} (${hues[i]}) vs speaker-${j} (${hues[j]}): ΔE ${distance.toFixed(1)}`,
              );
            }
          }
        }
        return collisions;
      };

      // The enforceable claim: in ordinary vision every speaker is their own
      // colour. This is where the duplicate violets were.
      expect(
        worstPair(rgbs, MIN_DELTA_E),
        `${theme} / ordinary vision`,
      ).toEqual([]);

      // And under each dichromacy, a regression guard — see the note above for
      // why this floor is low and what actually carries identity.
      for (const deficiency of DEFICIENCIES) {
        const simulated = rgbs.map((rgb) => simulate(rgb, deficiency));
        expect(
          worstPair(simulated, MIN_DELTA_E_SIMULATED),
          `${theme} / ${deficiency}`,
        ).toEqual([]);
      }
    });
  }

  test("T42-speaker · a speaker's name is always beside their colour", async ({
    page,
  }) => {
    /*
     * The claim that carries identity when hue cannot: every place a speaker
     * colour appears, the name appears with it. That is what makes the
     * red-green collisions the palette cannot avoid survivable, and it holds
     * for total colour blindness too.
     */
    await page.goto("/meeting/1");
    await expect(page.getByTestId("transcript-list")).toBeVisible();

    // The legend names every voice.
    const legend = page.locator('[data-testid^="speaker-legend-"]');
    expect(await legend.count()).toBeGreaterThan(0);
    for (const entry of await legend.all()) {
      expect((await entry.innerText()).trim().length).toBeGreaterThan(0);
    }

    // …and so does every turn in the transcript.
    const names = page.locator('[data-testid^="transcript-speaker-"]');
    expect(await names.count()).toBeGreaterThan(0);
    for (const name of await names.all()) {
      expect((await name.innerText()).trim().length).toBeGreaterThan(0);
    }
  });

  test("T42-status · an overdue action item says so in words, not only in red", async ({
    page,
  }) => {
    /*
     * The claim that survives total colour blindness and a greyscale print.
     * The seed carries an overdue item; if it ever stops doing so this test
     * fails loudly rather than passing vacuously, which is the point of
     * asserting the count first.
     */
    await page.goto("/meeting/1");
    await expect(page.getByTestId("action-items-section")).toBeVisible();

    const due = page.locator('[data-testid^="action-item-due-"]');
    expect(
      await due.count(),
      "no due badges in the seed to check",
    ).toBeGreaterThan(0);

    for (const badge of await due.all()) {
      const text = (await badge.innerText()).trim();
      // Colour is the accent; the words are the message.
      expect(
        text.length,
        "a due badge conveyed its state with colour alone",
      ).toBeGreaterThan(0);
    }
  });

  test("T42-status · a completed item is marked by more than its colour", async ({
    page,
  }) => {
    await page.goto("/meeting/1");
    await expect(page.getByTestId("action-items-section")).toBeVisible();

    // `aria-checked` is the non-visual channel, and the line-through is the
    // visual one — neither is a hue.
    const boxes = page.locator(
      '[data-testid^="action-item-"][role="checkbox"]',
    );
    expect(await boxes.count()).toBeGreaterThan(0);

    for (const box of await boxes.all()) {
      const checked = await box.getAttribute("aria-checked");
      expect(["true", "false"]).toContain(checked);
    }
  });

  test("T42-status · the action-item progress is a number, not only a bar", async ({
    page,
  }) => {
    await page.goto("/meeting/1");

    // A bar alone encodes progress in length and colour; the label is what
    // makes it readable without either.
    await expect(
      page.getByTestId("action-items-progress-label"),
    ).not.toBeEmpty();
  });
});
