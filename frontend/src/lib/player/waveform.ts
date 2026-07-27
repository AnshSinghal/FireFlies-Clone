/**
 * Waveform peaks (T-19.9).
 *
 * Two sources, one shape: `number[]` of PEAKS in `[0, 1]`.
 *
 * Real media is decoded once with the Web Audio API and downsampled. Meetings
 * without media get a deterministic pseudo-waveform seeded from the meeting id
 * — deterministic because `Math.random()` here would give a different strip on
 * every render, every navigation and every visual-regression run, which turns
 * a decoration into a source of false diffs.
 */

/** Bars in the strip. 400 is enough detail at any width the card can take. */
export const PEAK_COUNT = 400

const CACHE_PREFIX = 'ff.waveform.'

/** How many samples to inspect per bar. See the note in `decodePeaks`. */
const SAMPLES_PER_BUCKET = 256

/**
 * mulberry32 — small, fast, and good enough to look organic.
 *
 * The point is reproducibility, not statistical quality: the same meeting id
 * must always produce the same strip.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A waveform that reads as SPEECH rather than as noise.
 *
 * Flat random bars look like static. Real conversation has turns — a speaker
 * runs for a while, then a gap, then someone else — so a slow envelope drives
 * the amplitude and the per-bar jitter rides on top of it.
 */
export function pseudoPeaks(seed: number, count = PEAK_COUNT): number[] {
  const random = mulberry32(seed * 2654435761)
  const peaks: number[] = []

  let envelope = 0.5
  let turnLength = 0

  for (let i = 0; i < count; i += 1) {
    if (turnLength <= 0) {
      // A new speaking turn: 8–40 bars at its own level.
      turnLength = 8 + Math.floor(random() * 32)
      envelope = 0.25 + random() * 0.7
    }
    turnLength -= 1

    // Occasional near-silence, the way a real recording has pauses.
    const gap = random() < 0.04 ? 0.12 : 1
    const jitter = 0.55 + random() * 0.45

    peaks.push(Math.min(1, envelope * jitter * gap))
  }

  return peaks
}

function cacheKey(meetingId: number): string {
  return `${CACHE_PREFIX}${meetingId}`
}

export function readCachedPeaks(meetingId: number): number[] | null {
  try {
    const raw = window.sessionStorage.getItem(cacheKey(meetingId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    // Validated rather than trusted: a half-written or older-format entry
    // would otherwise reach the canvas as NaN and paint nothing at all.
    if (!parsed.every((value) => typeof value === 'number' && Number.isFinite(value))) return null
    return parsed as number[]
  } catch {
    return null
  }
}

export function writeCachedPeaks(meetingId: number, peaks: number[]): void {
  try {
    // Two decimals: the strip is ~48px tall, so more precision is invisible
    // and only makes the stored string longer.
    window.sessionStorage.setItem(
      cacheKey(meetingId),
      JSON.stringify(peaks.map((peak) => Math.round(peak * 100) / 100)),
    )
  } catch {
    // A full quota costs the cache, not the waveform.
  }
}

/**
 * Decode real media into peaks.
 *
 * Downsamples by taking the maximum absolute sample in each bucket, not the
 * average — averaging a symmetric waveform tends towards zero and produces a
 * flat strip that looks like silence.
 */
export async function decodePeaks(url: string, signal: AbortSignal): Promise<number[]> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`media responded ${response.status}`)

  const buffer = await response.arrayBuffer()

  const AudioContextCtor =
    window.AudioContext ??
    (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextCtor) throw new Error('no Web Audio API')

  const context = new AudioContextCtor()
  try {
    const audio = await context.decodeAudioData(buffer)
    const channel = audio.getChannelData(0)
    const bucket = Math.floor(channel.length / PEAK_COUNT) || 1

    /*
     * STRIDE through each bucket rather than reading every sample.
     *
     * Eighteen minutes of mono at 22kHz is 24 million samples; scanning all of
     * them to draw 400 bars is a ~200ms block of the main thread for a
     * decoration, and it showed up as exactly that in the long-task budget.
     * Sampling 256 points per bucket is visually indistinguishable — a peak
     * that only one sample in a hundred thousand reaches is a click, not a
     * shape — and two orders of magnitude cheaper.
     */
    const stride = Math.max(1, Math.floor(bucket / SAMPLES_PER_BUCKET))

    const peaks: number[] = []
    let max = 0

    for (let i = 0; i < PEAK_COUNT; i += 1) {
      let peak = 0
      const start = i * bucket
      for (let j = 0; j < bucket; j += stride) {
        const sample = Math.abs(channel[start + j] ?? 0)
        if (sample > peak) peak = sample
      }
      peaks.push(peak)
      if (peak > max) max = peak
    }

    // Normalised so a quietly-recorded meeting still fills the strip.
    return max > 0 ? peaks.map((peak) => peak / max) : peaks
  } finally {
    // Browsers cap concurrent AudioContexts; leaking one per navigation
    // eventually makes decoding fail outright.
    void context.close()
  }
}
