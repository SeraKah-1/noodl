/**
 * Hand gesture control for quiz navigation.
 *
 * Stack: MediaPipe GestureRecognizer (browser) — preferred over raw HandLandmarker
 * because it ships a trained classifier for Open_Palm / Closed_Fist / Thumb_Up /
 * Victory / Pointing_Up. We still run geometric finger-count on landmarks for
 * A/B/C/D (1–4 fingers) which the classifier does not fully cover.
 *
 * Best-practice notes (see docs analysis):
 * - Dwell-to-confirm (not instant fire) → fewer false triggers
 * - Temporal lock (N consecutive frames) before dwell starts
 * - Soft ROI guide so user knows where to put the hand
 * - Exclusive mode with camera context (HAND vs NOSE)
 */

import { useEffect, useRef, useState } from 'react';
import { useCamera } from '../contexts/CameraContext';

interface GestureState {
  isLoaded: boolean;
  error: string | null;
  detectedGesture: string | null; // "1" | "2" | "3" | "4" | "NEXT" | "BACK"
  dwellProgress: number; // 0 - 100
  inRoi: boolean;
  handPresent: boolean;
}

const DWELL_MS = 1100;
const STABLE_FRAMES = 3; // consecutive frames of same gesture before dwell starts
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** Finger extended if tip is farther from MCP than PIP, with scale buffer. */
const fingerOpen = (
  landmarks: Array<{ x: number; y: number; z?: number }>,
  tip: number,
  pip: number,
  mcp: number
) => {
  const dTip = dist(landmarks[tip], landmarks[mcp]);
  const dPip = dist(landmarks[pip], landmarks[mcp]);
  // 12% beyond PIP distance → open (tighter than old wrist-distance check)
  return dTip > dPip * 1.12;
};

/** Thumb open relative to palm center; uses handedness when available. */
const thumbOpen = (
  landmarks: Array<{ x: number; y: number }>,
  handedness?: string
) => {
  const tip = landmarks[4];
  const ip = landmarks[3];
  const mcp = landmarks[2];
  const indexMcp = landmarks[5];
  const pinkyMcp = landmarks[17];
  const wrist = landmarks[0];
  const scale = dist(wrist, landmarks[9]) || 0.2;

  // Away from palm midline
  const palmMid = {
    x: (indexMcp.x + pinkyMcp.x) / 2,
    y: (indexMcp.y + pinkyMcp.y) / 2,
  };
  const tipAway = dist(tip, palmMid) > dist(mcp, palmMid) * 1.15;
  const tipPastIp = dist(tip, wrist) > dist(ip, wrist) + scale * 0.08;

  // Handedness-aware lateral check (image coords, not mirrored)
  let lateral = true;
  if (handedness === 'Right') {
    lateral = tip.x < indexMcp.x - scale * 0.05 || tipAway;
  } else if (handedness === 'Left') {
    lateral = tip.x > indexMcp.x + scale * 0.05 || tipAway;
  }

  return tipAway && tipPastIp && lateral;
};

/** Map MediaPipe classifier labels + geometry → quiz actions. */
export function classifyHandGesture(
  landmarks: Array<{ x: number; y: number; z?: number }>,
  modelLabel: string | null,
  modelScore: number,
  handedness?: string
): string | null {
  const indexExt = fingerOpen(landmarks, 8, 6, 5);
  const middleExt = fingerOpen(landmarks, 12, 10, 9);
  const ringExt = fingerOpen(landmarks, 16, 14, 13);
  const pinkyExt = fingerOpen(landmarks, 20, 18, 17);
  const thumbExt = thumbOpen(landmarks, handedness);
  const fingers =
    (indexExt ? 1 : 0) +
    (middleExt ? 1 : 0) +
    (ringExt ? 1 : 0) +
    (pinkyExt ? 1 : 0);

  // Closed fist: ignore (no accidental triggers) — model or geometry
  if (
    (modelLabel === 'Closed_Fist' && modelScore >= 0.55) ||
    (fingers === 0 && !thumbExt)
  ) {
    return null;
  }

  // Prefer high-confidence model labels for palm / thumb / victory / point
  if (modelScore >= 0.55 && modelLabel) {
    if (modelLabel === 'Open_Palm') return 'BACK';
    if (modelLabel === 'Thumb_Up') return 'NEXT';
    if (modelLabel === 'Victory' && indexExt && middleExt) return '2';
    if (modelLabel === 'Pointing_Up' && indexExt && fingers <= 2) return '1';
  }

  // Geometry: finger counts for A–D (most reliable for multi-choice)
  if (fingers === 1 && indexExt) return '1';
  if (fingers === 2 && indexExt && middleExt && !ringExt) return '2';
  if (fingers === 3 && indexExt && middleExt && ringExt && !pinkyExt) return '3';
  // 4 fingers, thumb tucked → D; open palm (4+thumb) → BACK
  if (fingers === 4) {
    if (thumbExt) return 'BACK';
    return '4';
  }
  // Thumb only → NEXT (thumbs up / out)
  if (fingers === 0 && thumbExt) return 'NEXT';

  // Soft model fallbacks when geometry is ambiguous
  if (modelScore >= 0.7) {
    if (modelLabel === 'Open_Palm') return 'BACK';
    if (modelLabel === 'Thumb_Up') return 'NEXT';
    if (modelLabel === 'Victory') return '2';
    if (modelLabel === 'Pointing_Up') return '1';
  }

  return null;
}

export const useHandGesture = (
  onTrigger: (gesture: string) => void,
  isPaused: boolean
) => {
  const { videoRef, isCameraReady, stream } = useCamera();
  const onTriggerRef = useRef(onTrigger);
  const isPausedRef = useRef(isPaused);

  useEffect(() => {
    onTriggerRef.current = onTrigger;
  }, [onTrigger]);
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const [state, setState] = useState<GestureState>({
    isLoaded: false,
    error: null,
    detectedGesture: null,
    dwellProgress: 0,
    inRoi: false,
    handPresent: false,
  });

  const [isHandDetected, setIsHandDetected] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recognizerRef = useRef<any>(null);
  const requestRef = useRef<number>(0);
  const loopActiveRef = useRef(false);
  const lastGestureRef = useRef<string | null>(null);
  const gestureStartTimeRef = useRef<number>(0);
  const hasTriggeredRef = useRef<boolean>(false);
  const lastVideoTimeRef = useRef<number>(-1);
  const stableGestureRef = useRef<string | null>(null);
  const stableCountRef = useRef(0);
  const lastUiPushRef = useRef(0);

  // --- Load GestureRecognizer (includes landmarks) ---
  useEffect(() => {
    let active = true;
    let loadTimeout: ReturnType<typeof setTimeout>;

    const load = async () => {
      try {
        loadTimeout = setTimeout(() => {
          if (active) {
            setState((prev) => ({
              ...prev,
              error: 'Slow network — hand model timed out.',
            }));
          }
        }, 20000);

        // @ts-ignore - CDN ESM
        const { FilesetResolver, GestureRecognizer } = await import(
          'https://esm.sh/@mediapipe/tasks-vision@0.10.17'
        );

        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        if (!active) return;

        let recognizer: any;
        try {
          recognizer = await GestureRecognizer.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: MODEL_URL,
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numHands: 1,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
        } catch {
          // GPU path fails on some devices → CPU
          recognizer = await GestureRecognizer.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: MODEL_URL,
              delegate: 'CPU',
            },
            runningMode: 'VIDEO',
            numHands: 1,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
        }

        clearTimeout(loadTimeout);
        if (!active) {
          try {
            recognizer.close();
          } catch {
            /* ignore */
          }
          return;
        }

        recognizerRef.current = recognizer;
        setState((prev) => ({ ...prev, isLoaded: true, error: null }));
      } catch (err: any) {
        console.error('[HandGesture] Load error:', err);
        clearTimeout(loadTimeout);
        if (active) {
          setState((prev) => ({
            ...prev,
            error: 'Could not load hand model. Check network, or use touch.',
          }));
        }
      }
    };

    void load();

    return () => {
      active = false;
      loopActiveRef.current = false;
      clearTimeout(loadTimeout);
      if (recognizerRef.current) {
        try {
          recognizerRef.current.close();
        } catch {
          /* ignore */
        }
        recognizerRef.current = null;
      }
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      requestRef.current = 0;
    };
  }, []);

  useEffect(() => {
    if (isCameraReady && recognizerRef.current && !state.error && state.isLoaded) {
      loopActiveRef.current = true;
      requestRef.current = requestAnimationFrame(predictWebcam);
    } else {
      loopActiveRef.current = false;
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = 0;
      }
    }
    return () => {
      loopActiveRef.current = false;
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = 0;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCameraReady, state.isLoaded, state.error]);

  const pushUi = (patch: Partial<GestureState>) => {
    const now = performance.now();
    // Throttle React state ~15fps to keep UI smooth
    if (now - lastUiPushRef.current < 66 && patch.dwellProgress === undefined) {
      return;
    }
    lastUiPushRef.current = now;
    setState((prev) => ({ ...prev, ...patch }));
  };

  const resetDwell = () => {
    lastGestureRef.current = null;
    gestureStartTimeRef.current = 0;
    hasTriggeredRef.current = false;
    stableGestureRef.current = null;
    stableCountRef.current = 0;
    pushUi({ detectedGesture: null, dwellProgress: 0 });
  };

  const handleDwellTime = (gesture: string | null) => {
    const now = performance.now();

    // Temporal lock: need STABLE_FRAMES of the same raw gesture
    if (gesture === stableGestureRef.current) {
      stableCountRef.current += 1;
    } else {
      stableGestureRef.current = gesture;
      stableCountRef.current = 1;
      // Reset dwell when gesture identity flips
      lastGestureRef.current = null;
      gestureStartTimeRef.current = 0;
      hasTriggeredRef.current = false;
    }

    if (!gesture || stableCountRef.current < STABLE_FRAMES) {
      if (!gesture) resetDwell();
      else pushUi({ detectedGesture: gesture, dwellProgress: 0 });
      return;
    }

    if (gesture === lastGestureRef.current) {
      const duration = now - gestureStartTimeRef.current;
      const progress = Math.min(100, (duration / DWELL_MS) * 100);
      pushUi({ detectedGesture: gesture, dwellProgress: progress });

      if (duration >= DWELL_MS && !hasTriggeredRef.current) {
        onTriggerRef.current(gesture);
        hasTriggeredRef.current = true;
        try {
          navigator.vibrate?.([40, 40, 40]);
        } catch {
          /* ignore */
        }
      }
    } else {
      lastGestureRef.current = gesture;
      gestureStartTimeRef.current = now;
      hasTriggeredRef.current = false;
      pushUi({ detectedGesture: gesture, dwellProgress: 0 });
    }
  };

  /**
   * ROI guide: visible outer frame + inner "active" zone.
   * Input only counts inside the *inner* rect so border grazing does not fire.
   */
  const drawRoiGuide = (
    ctx: CanvasRenderingContext2D,
    roiX: number,
    roiY: number,
    roiW: number,
    roiH: number,
    active: boolean,
    inner: { x: number; y: number; w: number; h: number }
  ) => {
    // Dim outside the outer frame so the box is obvious
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.clearRect(roiX, roiY, roiW, roiH);

    const len = Math.min(roiW, roiH) * 0.16;
    const color = active ? 'rgba(167, 139, 250, 0.95)' : 'rgba(255, 255, 255, 0.75)';
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2.5, ctx.canvas.width * 0.006);
    ctx.lineCap = 'round';
    ctx.setLineDash([]);

    const corners: Array<[number, number, number, number, number, number]> = [
      [roiX, roiY, len, 0, 0, len],
      [roiX + roiW, roiY, -len, 0, 0, len],
      [roiX, roiY + roiH, len, 0, 0, -len],
      [roiX + roiW, roiY + roiH, -len, 0, 0, -len],
    ];

    for (const [x, y, dx1, dy1, dx2, dy2] of corners) {
      ctx.beginPath();
      ctx.moveTo(x + dx1, y + dy1);
      ctx.lineTo(x, y);
      ctx.lineTo(x + dx2, y + dy2);
      ctx.stroke();
    }

    // Outer solid border
    ctx.strokeStyle = active ? 'rgba(167, 139, 250, 0.55)' : 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = Math.max(1.5, ctx.canvas.width * 0.0035);
    ctx.setLineDash([]);
    ctx.strokeRect(roiX, roiY, roiW, roiH);

    // Inner active zone (stricter) — dashed
    ctx.strokeStyle = active ? 'rgba(196, 181, 253, 0.7)' : 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.25;
    ctx.setLineDash([5, 6]);
    ctx.strokeRect(inner.x, inner.y, inner.w, inner.h);
    ctx.setLineDash([]);

    // Center crosshair (subtle)
    const cx = inner.x + inner.w / 2;
    const cy = inner.y + inner.h / 2;
    const arm = Math.min(inner.w, inner.h) * 0.06;
    ctx.strokeStyle = active ? 'rgba(167, 139, 250, 0.5)' : 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - arm, cy);
    ctx.lineTo(cx + arm, cy);
    ctx.moveTo(cx, cy - arm);
    ctx.lineTo(cx, cy + arm);
    ctx.stroke();
  };

  const drawHand = (
    ctx: CanvasRenderingContext2D,
    landmarks: Array<{ x: number; y: number }>,
    color: string
  ) => {
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [0, 9], [9, 10], [10, 11], [11, 12],
      [0, 13], [13, 14], [14, 15], [15, 16],
      [0, 17], [17, 18], [18, 19], [19, 20],
      [5, 9], [9, 13], [13, 17],
    ];
    for (const [s, e] of connections) {
      const p1 = landmarks[s];
      const p2 = landmarks[e];
      ctx.moveTo(p1.x * ctx.canvas.width, p1.y * ctx.canvas.height);
      ctx.lineTo(p2.x * ctx.canvas.width, p2.y * ctx.canvas.height);
    }
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.shadowBlur = 0;
    for (const p of landmarks) {
      ctx.beginPath();
      ctx.arc(p.x * ctx.canvas.width, p.y * ctx.canvas.height, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const predictWebcam = () => {
    if (!loopActiveRef.current) return;
    const recognizer = recognizerRef.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!recognizer || !video || !canvas) {
      if (loopActiveRef.current) {
        requestRef.current = requestAnimationFrame(predictWebcam);
      }
      return;
    }

    if (video.readyState < 2 || video.videoWidth === 0) {
      if (loopActiveRef.current) {
        requestRef.current = requestAnimationFrame(predictWebcam);
      }
      return;
    }

    // ~12–15 FPS inference
    if (video.currentTime !== lastVideoTimeRef.current) {
      const timeDiff = (video.currentTime - lastVideoTimeRef.current) * 1000;
      if (lastVideoTimeRef.current >= 0 && timeDiff < 70) {
        if (loopActiveRef.current) {
          requestRef.current = requestAnimationFrame(predictWebcam);
        }
        return;
      }
      lastVideoTimeRef.current = video.currentTime;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        if (loopActiveRef.current) {
          requestRef.current = requestAnimationFrame(predictWebcam);
        }
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Outer guide box (visible). Active zone is inset so edge grazing does NOT fire.
      const roiW = canvas.width * 0.52;
      const roiH = canvas.height * 0.58;
      const roiX = (canvas.width - roiW) / 2;
      const roiY = (canvas.height - roiH) / 2;
      const INSET = 0.14; // 14% margin inside outer frame
      const inner = {
        x: roiX + roiW * INSET,
        y: roiY + roiH * INSET,
        w: roiW * (1 - 2 * INSET),
        h: roiH * (1 - 2 * INSET),
      };

      let results: any;
      try {
        results = recognizer.recognizeForVideo(video, performance.now());
      } catch (e) {
        console.warn('[HandGesture] recognize frame failed', e);
        if (loopActiveRef.current) {
          requestRef.current = requestAnimationFrame(predictWebcam);
        }
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const landmarks = results?.landmarks?.[0];
      const handLabels = results?.handednesses?.[0]?.[0];
      const handedness = handLabels?.categoryName as string | undefined;
      const topGesture = results?.gestures?.[0]?.[0];
      const modelLabel = topGesture?.categoryName === 'None' ? null : topGesture?.categoryName || null;
      const modelScore = topGesture?.score ?? 0;

      let inROI = false;

      if (landmarks && landmarks.length >= 21) {
        setIsHandDetected(true);
        const wrist = landmarks[0];
        const middleMcp = landmarks[9];
        const indexTip = landmarks[8];
        const cx = ((wrist.x + middleMcp.x) / 2) * canvas.width;
        const cy = ((wrist.y + middleMcp.y) / 2) * canvas.height;
        const tipX = indexTip.x * canvas.width;
        const tipY = indexTip.y * canvas.height;

        // Strict: palm center AND index tip must sit inside the *inner* zone
        const inInner = (x: number, y: number) =>
          x >= inner.x && x <= inner.x + inner.w && y >= inner.y && y <= inner.y + inner.h;
        inROI = inInner(cx, cy) && inInner(tipX, tipY);

        drawRoiGuide(ctx, roiX, roiY, roiW, roiH, inROI, inner);
        drawHand(ctx, landmarks, inROI ? 'rgba(167,139,250,0.95)' : 'rgba(244,63,94,0.75)');

        if (inROI && !isPausedRef.current) {
          const gesture = classifyHandGesture(
            landmarks,
            modelLabel,
            modelScore,
            handedness
          );
          handleDwellTime(gesture);
        } else {
          resetDwell();
        }

        pushUi({ inRoi: inROI, handPresent: true });
      } else {
        setIsHandDetected(false);
        drawRoiGuide(ctx, roiX, roiY, roiW, roiH, false, inner);
        resetDwell();
        pushUi({ inRoi: false, handPresent: false });
      }
    }

    if (loopActiveRef.current) {
      requestRef.current = requestAnimationFrame(predictWebcam);
    }
  };

  return {
    canvasRef,
    isHandDetected,
    stream,
    inRoi: state.inRoi,
    handPresent: state.handPresent,
    ...state,
  };
};
