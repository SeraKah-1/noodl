/**
 * Hand gesture control for quiz navigation.
 *
 * Classification: pure math in handGestureMath.ts (geometry-first A–D)
 * + MediaPipe GestureRecognizer labels as assistants for palm/thumb.
 * Temporal majority vote reduces 1-frame flips (1→D noise).
 */

import { useEffect, useRef, useState } from 'react';
import { useCamera } from '../contexts/CameraContext';
import { getVisionFileset } from '../services/mediaPipeVisionService';
import {
  classifyHandGesture,
  majorityVote,
} from './handGestureMath';

interface GestureState {
  isLoaded: boolean;
  error: string | null;
  detectedGesture: string | null;
  dwellProgress: number;
  inRoi: boolean;
  handPresent: boolean;
}

/** Longer hold — fewer accidental picks */
const DWELL_MS = 1750;
/** Frames of same voted gesture before dwell clock starts (~5 @12fps ≈ 0.4s) */
const STABLE_FRAMES = 5;
/** Ring buffer for majority vote */
const VOTE_WINDOW = 7;
const VOTE_MIN = 4;

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';

export { classifyHandGesture } from './handGestureMath';

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
  const voteBufRef = useRef<Array<string | null>>([]);

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

        const [{ GestureRecognizer }, vision] = await Promise.all([
          import('@mediapipe/tasks-vision'),
          getVisionFileset(),
        ]);
        if (!active) return;

        const opts = {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' as const },
          runningMode: 'VIDEO' as const,
          numHands: 1,
          minHandDetectionConfidence: 0.55,
          minHandPresenceConfidence: 0.55,
          minTrackingConfidence: 0.55,
        };

        let recognizer: any;
        try {
          recognizer = await GestureRecognizer.createFromOptions(vision, opts);
        } catch {
          recognizer = await GestureRecognizer.createFromOptions(vision, {
            ...opts,
            baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
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
    if (now - lastUiPushRef.current < 50 && patch.dwellProgress === undefined) {
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

    if (gesture === stableGestureRef.current) {
      stableCountRef.current += 1;
    } else {
      stableGestureRef.current = gesture;
      stableCountRef.current = 1;
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
          navigator.vibrate?.([35, 40, 35]);
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

  const drawRoiGuide = (
    ctx: CanvasRenderingContext2D,
    roiX: number,
    roiY: number,
    roiW: number,
    roiH: number,
    active: boolean,
    inner: { x: number; y: number; w: number; h: number }
  ) => {
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
    ctx.strokeStyle = active ? 'rgba(167, 139, 250, 0.55)' : 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = Math.max(1.5, ctx.canvas.width * 0.0035);
    ctx.strokeRect(roiX, roiY, roiW, roiH);
    ctx.strokeStyle = active ? 'rgba(196, 181, 253, 0.7)' : 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.25;
    ctx.setLineDash([5, 6]);
    ctx.strokeRect(inner.x, inner.y, inner.w, inner.h);
    ctx.setLineDash([]);
  };

  const drawHand = (
    ctx: CanvasRenderingContext2D,
    landmarks: Array<{ x: number; y: number }>,
    color: string
  ) => {
    ctx.shadowColor = color;
    ctx.shadowBlur = 5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
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
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    for (const p of landmarks) {
      ctx.beginPath();
      ctx.arc(p.x * ctx.canvas.width, p.y * ctx.canvas.height, 1.6, 0, Math.PI * 2);
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

      const roiW = canvas.width * 0.52;
      const roiH = canvas.height * 0.58;
      const roiX = (canvas.width - roiW) / 2;
      const roiY = (canvas.height - roiH) / 2;
      const INSET = 0.12;
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
        console.warn('[HandGesture] frame failed', e);
        if (loopActiveRef.current) {
          requestRef.current = requestAnimationFrame(predictWebcam);
        }
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const landmarks = results?.landmarks?.[0];
      const handLabels = results?.handednesses?.[0]?.[0];
      // MediaPipe: "Left" | "Right" from camera view; works for either physical hand
      const handedness = handLabels?.categoryName as string | undefined;
      const topGesture = results?.gestures?.[0]?.[0];
      const modelLabel =
        topGesture?.categoryName === 'None' ? null : topGesture?.categoryName || null;
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

        const inInner = (x: number, y: number) =>
          x >= inner.x && x <= inner.x + inner.w && y >= inner.y && y <= inner.y + inner.h;
        // Palm center in inner zone is enough for ROI (tip alone was too strict / flipped hands failed)
        inROI = inInner(cx, cy);

        drawRoiGuide(ctx, roiX, roiY, roiW, roiH, inROI, inner);
        drawHand(
          ctx,
          landmarks,
          inROI ? 'rgba(167,139,250,0.95)' : 'rgba(244,63,94,0.75)'
        );

        if (inROI && !isPausedRef.current) {
          const raw = classifyHandGesture(
            landmarks,
            modelLabel,
            modelScore,
            handedness
          );
          // Majority vote across recent frames (kills 1→D flicker)
          const buf = voteBufRef.current;
          buf.push(raw);
          if (buf.length > VOTE_WINDOW) buf.shift();
          const voted = majorityVote(buf, VOTE_MIN);
          handleDwellTime(voted);
        } else {
          voteBufRef.current = [];
          resetDwell();
        }

        pushUi({ inRoi: inROI, handPresent: true });
      } else {
        setIsHandDetected(false);
        voteBufRef.current = [];
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
