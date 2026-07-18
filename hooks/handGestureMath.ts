/**
 * Pure hand-gesture math (testable, no React).
 *
 * Goals:
 * - Rotation / palm-facing robust finger open scores
 * - Avoid “1 finger → D” (false open on ring/pinky)
 * - Work for left OR right hand, mirrored selfie, rough palm flip
 */

export type Pt = { x: number; y: number; z?: number };

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Unit-ish vector */
const sub = (a: Pt, b: Pt) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v: { x: number; y: number }) => Math.hypot(v.x, v.y) || 1e-6;
const dot = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  a.x * b.x + a.y * b.y;

/**
 * Extension score 0..1 for a non-thumb finger.
 * Combines (1) tip farther from wrist than joints, (2) chain straightness.
 * Works for left/right and most palm orientations better than MCP-only distance.
 */
export function fingerExtensionScore(
  lm: Pt[],
  tip: number,
  pip: number,
  mcp: number,
  wrist: number = 0
): number {
  const W = lm[wrist];
  const Tip = lm[tip];
  const Pip = lm[pip];
  const Mcp = lm[mcp];

  const dTip = dist(Tip, W);
  const dPip = dist(Pip, W);
  const dMcp = dist(Mcp, W);

  // Reach: tip should outrank pip along wrist distance
  // curled: dTip ≈ dPip or smaller; open: dTip >> dPip
  const reach = clamp01((dTip - dPip) / (Math.max(dMcp, 0.05) * 0.55 + 1e-6));

  // Straightness at PIP: MCP→PIP and PIP→TIP should align
  const v1 = sub(Pip, Mcp);
  const v2 = sub(Tip, Pip);
  const cos = clamp01((dot(v1, v2) / (len(v1) * len(v2)) + 0.15) / 1.15);

  // Absolute chain length vs palm scale
  const scale = dist(W, lm[9]) || 0.2;
  const chain = dist(Mcp, Pip) + dist(Pip, Tip);
  const lengthOk = clamp01((chain / scale - 0.55) / 0.7);

  // Weight straightness high — curled fingers often still have tip “far” in projection noise
  return 0.4 * reach + 0.4 * cos + 0.2 * lengthOk;
}

/**
 * Thumb extension 0..1 — handedness optional; also works without it via palm distance.
 */
export function thumbExtensionScore(lm: Pt[], handedness?: string): number {
  const tip = lm[4];
  const ip = lm[3];
  const mcp = lm[2];
  const cmc = lm[1];
  const indexMcp = lm[5];
  const pinkyMcp = lm[17];
  const wrist = lm[0];
  const scale = dist(wrist, lm[9]) || 0.2;

  const palmMid = {
    x: (indexMcp.x + pinkyMcp.x) / 2,
    y: (indexMcp.y + pinkyMcp.y) / 2,
  };

  // Away from palm center
  const away = clamp01(
    (dist(tip, palmMid) - dist(mcp, palmMid)) / (scale * 0.45 + 1e-6)
  );

  // Extended along thumb chain
  const chain = dist(cmc, mcp) + dist(mcp, ip) + dist(ip, tip);
  const chainScore = clamp01((chain / scale - 0.7) / 0.6);

  // Lateral vs index MCP (handedness-aware; if unknown, use either side)
  let lateral = 0.5;
  if (handedness === 'Right') {
    lateral = tip.x < indexMcp.x - scale * 0.02 ? 1 : tip.x < indexMcp.x ? 0.55 : 0.15;
  } else if (handedness === 'Left') {
    lateral = tip.x > indexMcp.x + scale * 0.02 ? 1 : tip.x > indexMcp.x ? 0.55 : 0.15;
  } else {
    lateral = Math.abs(tip.x - indexMcp.x) > scale * 0.08 ? 0.85 : 0.35;
  }

  return 0.4 * away + 0.35 * chainScore + 0.25 * lateral;
}

export type FingerScores = {
  index: number;
  middle: number;
  ring: number;
  pinky: number;
  thumb: number;
};

export function scoreFingers(lm: Pt[], handedness?: string): FingerScores {
  return {
    index: fingerExtensionScore(lm, 8, 6, 5),
    middle: fingerExtensionScore(lm, 12, 10, 9),
    // Slightly stricter thresholds applied later for ring/pinky (false open → fake “4”)
    ring: fingerExtensionScore(lm, 16, 14, 13),
    pinky: fingerExtensionScore(lm, 20, 18, 17),
    thumb: thumbExtensionScore(lm, handedness),
  };
}

/**
 * Convert scores → discrete finger count with anti-false-positive rules.
 * Index/middle lower threshold; ring/pinky higher (main cause of 1→D).
 */
export function openMask(scores: FingerScores) {
  const OPEN_IM = 0.48;
  const OPEN_RP = 0.58; // ring/pinky harder to call open
  const OPEN_THUMB = 0.55;

  return {
    index: scores.index >= OPEN_IM,
    middle: scores.middle >= OPEN_IM,
    ring: scores.ring >= OPEN_RP,
    pinky: scores.pinky >= OPEN_RP,
    thumb: scores.thumb >= OPEN_THUMB,
  };
}

/**
 * Dominant-finger rescue: if index is clearly strongest and others weak → treat as 1.
 * Prevents weak ring/pinky noise from flipping 1 → 3/4.
 */
export function resolveFingerGesture(scores: FingerScores): {
  fingers: number;
  mask: ReturnType<typeof openMask>;
  gesture: '1' | '2' | '3' | '4' | 'NEXT' | 'BACK' | null;
} {
  let mask = openMask(scores);

  // Dominance: index much stronger than others → force single-finger A
  const nonIndexMax = Math.max(scores.middle, scores.ring, scores.pinky);
  if (scores.index >= 0.5 && scores.index >= nonIndexMax + 0.14) {
    mask = {
      index: true,
      middle: scores.middle >= 0.62, // only keep if really open
      ring: scores.ring >= 0.65,
      pinky: scores.pinky >= 0.65,
      thumb: mask.thumb,
    };
  }

  // Peace: index+middle high, ring/pinky low
  if (
    scores.index >= 0.48 &&
    scores.middle >= 0.48 &&
    scores.ring < 0.5 &&
    scores.pinky < 0.5
  ) {
    mask = {
      index: true,
      middle: true,
      ring: false,
      pinky: false,
      thumb: mask.thumb,
    };
  }

  const fingers =
    (mask.index ? 1 : 0) +
    (mask.middle ? 1 : 0) +
    (mask.ring ? 1 : 0) +
    (mask.pinky ? 1 : 0);

  // Fist
  if (fingers === 0 && !mask.thumb) {
    return { fingers, mask, gesture: null };
  }

  // Thumb only → NEXT
  if (fingers === 0 && mask.thumb) {
    return { fingers, mask, gesture: 'NEXT' };
  }

  // Geometry A–D / BACK
  if (fingers === 1 && mask.index) {
    return { fingers, mask, gesture: '1' };
  }
  // Single non-index finger: still map to that digit carefully
  if (fingers === 1 && mask.middle) {
    // Middle only rare — treat as ambiguous null rather than wrong letter
    return { fingers, mask, gesture: null };
  }
  if (fingers === 2 && mask.index && mask.middle && !mask.ring) {
    return { fingers, mask, gesture: '2' };
  }
  if (fingers === 3 && mask.index && mask.middle && mask.ring && !mask.pinky) {
    return { fingers, mask, gesture: '3' };
  }
  if (fingers === 4) {
    // Open palm if thumb out, else D
    return { fingers, mask, gesture: mask.thumb ? 'BACK' : '4' };
  }
  // 3 with pinky instead of ring, etc. — ambiguous
  if (fingers === 3 && mask.index && mask.middle) {
    return { fingers, mask, gesture: '3' };
  }

  return { fingers, mask, gesture: null };
}

/**
 * Final classifier: model labels are assistants, geometry is authority for A–D.
 * High-confidence palm/thumb/victory still allowed.
 */
export function classifyHandGesture(
  landmarks: Pt[],
  modelLabel: string | null,
  modelScore: number,
  handedness?: string
): string | null {
  if (!landmarks || landmarks.length < 21) return null;

  const scores = scoreFingers(landmarks, handedness);
  const resolved = resolveFingerGesture(scores);

  // Model closed fist → idle
  if (modelLabel === 'Closed_Fist' && modelScore >= 0.5) {
    if (resolved.fingers <= 1) return null;
  }

  // Geometry A–D first when we have a clear finger count 1–4 without thumb-only
  if (resolved.gesture === '1' || resolved.gesture === '2' || resolved.gesture === '3') {
    return resolved.gesture;
  }
  if (resolved.gesture === '4') {
    // Don't let weak model Open_Palm steal D; only BACK if thumb clearly open or model very sure
    if (resolved.mask.thumb || (modelLabel === 'Open_Palm' && modelScore >= 0.75)) {
      return resolved.mask.thumb ? 'BACK' : '4';
    }
    return '4';
  }
  if (resolved.gesture === 'BACK') return 'BACK';
  if (resolved.gesture === 'NEXT') return 'NEXT';

  // Model assists only when geometry ambiguous
  if (modelScore >= 0.65 && modelLabel) {
    if (modelLabel === 'Open_Palm') return 'BACK';
    if (modelLabel === 'Thumb_Up') return 'NEXT';
    if (modelLabel === 'Victory') {
      // Only if geometry roughly agrees (at least 2 fingers-ish)
      if (scores.index >= 0.4 && scores.middle >= 0.4) return '2';
    }
    if (modelLabel === 'Pointing_Up') {
      if (scores.index >= 0.45 && scores.middle < 0.55 && scores.ring < 0.55) return '1';
    }
  }

  return null;
}

/** Majority vote over a ring buffer of labels */
export function majorityVote(
  buffer: Array<string | null>,
  minCount: number
): string | null {
  const counts = new Map<string, number>();
  let best: string | null = null;
  let bestN = 0;
  for (const g of buffer) {
    if (!g) continue;
    const n = (counts.get(g) || 0) + 1;
    counts.set(g, n);
    if (n > bestN) {
      bestN = n;
      best = g;
    }
  }
  return bestN >= minCount ? best : null;
}
