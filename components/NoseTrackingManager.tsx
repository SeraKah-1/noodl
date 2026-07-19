import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import { useCamera } from '../contexts/CameraContext';
import { DwellIndicator, DwellRingBadge } from './DwellIndicator';
import { getLocale } from '../services/i18n';
import { getVisionFileset } from '../services/mediaPipeVisionService';

/**
 * Nose pointer — comfort-first head mouse (micromovement).
 *
 * Design (balance comfort × accuracy):
 * 1. RELATIVE to a neutral origin (not absolute face-in-frame).
 *    Rest your neck anywhere → Smile / R / Space recalibrates origin.
 * 2. HIGH GAIN so tiny neck moves cover the full screen
 *    (~±4–6% of frame → full viewport).
 * 3. Soft deadzone kills tremor; soft knee at edges keeps aim stable.
 * 4. One-Euro-style adaptive smoothing: sticky when still, snappy when moving
 *    (removes lag without jitter).
 * 5. Prev/Next = full-height screen edges (any vertical position).
 */

const getViewport = () => {
  const vv = window.visualViewport;
  return {
    w: vv?.width ?? window.innerWidth,
    h: vv?.height ?? window.innerHeight,
    left: vv?.offsetLeft ?? 0,
    top: vv?.offsetTop ?? 0,
  };
};

/** How far (normalized nose delta) maps to half the screen. Smaller = more sensitive. */
const HALF_SCREEN_DELTA = 0.055; // ±5.5% of camera frame ≈ full width/height
/** Ignore motion smaller than this (normalized) — anti-tremor, still allows micro aim */
const DEADZONE = 0.0028;
/** Soft response curve after deadzone (1 = linear, >1 gentler near center) */
const RESPONSE_POWER = 0.92;
/**
 * Adaptive smooth (higher = more lag).
 * min when moving fast, max when still.
 */
/** Velocity (norm units/s) that counts as “moving” for adaptive follow */
const VEL_FAST = 0.35;
/** Slow adaptation of origin while nearly still — reduces long-session neck strain */
const ORIGIN_ADAPT = 0.0018;
const FACE_LANDMARKER_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

interface NoseTrackingManagerProps {
  onOptionSelect: (index: number) => void;
  onNext: () => void;
  onPrev: () => void;
  isAnswered: boolean;
}

export const NoseTrackingManager: React.FC<NoseTrackingManagerProps> = ({
  onOptionSelect,
  onNext,
  onPrev,
  isAnswered
}) => {
  const { videoRef: globalVideoRef, isCameraReady, stream } = useCamera();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const landmarkerRef = useRef<any>(null);
  const requestRef = useRef<number>(0);
  const loopActiveRef = useRef(false);
  const lastVideoTimeRef = useRef<number>(-1);

  // Sync stream to local preview; clear when stream is gone so LED can release
  useEffect(() => {
    const el = localVideoRef.current;
    if (!el) return;
    if (stream) {
      el.srcObject = stream;
      void el.play().catch(() => {});
    } else {
      try { el.pause(); } catch { /* ignore */ }
      el.srcObject = null;
    }
  }, [stream]);

  const [status, setStatus] = useState<string>('Loading AI...');
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  
  // Ghost Pointer Ref (Direct DOM Mutation)
  const pointerRef = useRef<HTMLDivElement>(null);
  const cursorPosRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const smoothPosRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  /** Neutral nose pose (mirrored-x, y). Recenter = rest neck here. */
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const lastNormRef = useRef<{ x: number; y: number; t: number } | null>(null);

  // Dwell Time State
  const [hoveredOption, setHoveredOption] = useState<number | string | null>(null);
  const [dwellProgress, setDwellProgress] = useState(0);
  
  // Navigation Dwell State
  const [hoveredNav, setHoveredNav] = useState<'prev' | 'next' | null>(null);
  const [navDwellProgress, setNavDwellProgress] = useState(0);
  
  // Scroll Feedback State
  const [hoveredScroll, setHoveredScroll] = useState<'up' | 'down' | null>(null);
  const lastScrollStateRef = useRef<'up' | 'down' | null>(null);

  const hoverStartTimeRef = useRef<number>(0);
  const currentHoveredOptionRef = useRef<number | string | null>(null);
  const hasTriggeredRef = useRef<boolean>(false);
  /** Slower option dwell — stops accidental picks while aiming / scrolling */
  const DWELL_DURATION = 1600;

  const navHoverStartTimeRef = useRef<number>(0);
  const currentHoveredNavRef = useRef<'prev' | 'next' | null>(null);
  const hasNavTriggeredRef = useRef<boolean>(false);
  const NAV_DWELL_DURATION = 1300;

  // Smile to Reset State
  const [isSmiling, setIsSmiling] = useState(false);
  const isSmilingRef = useRef(false);
  const smileStartTimeRef = useRef<number>(0);
  const hasSmileTriggeredRef = useRef<boolean>(false);
  const SMILE_DWELL_DURATION = 500; // 0.5 seconds of smiling to reset

  useEffect(() => {
    let active = true;
    let loadTimeout: NodeJS.Timeout;
    
    const initMediaPipe = async () => {
      try {
        loadTimeout = setTimeout(() => {
            if (active) setStatus('Connection slow...');
        }, 15000);

        const [{ FaceLandmarker }, vision] = await Promise.all([
          import('@mediapipe/tasks-vision'),
          getVisionFileset(),
        ]);

        if (!active) return;

        const options = {
          baseOptions: {
            modelAssetPath: FACE_LANDMARKER_MODEL_URL,
            delegate: 'GPU' as const,
          },
          runningMode: 'VIDEO' as const,
          numFaces: 1, 
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          outputFaceBlendshapes: true
        };

        let landmarker: any;
        try {
          landmarker = await FaceLandmarker.createFromOptions(vision, options);
        } catch {
          landmarker = await FaceLandmarker.createFromOptions(vision, {
            ...options,
            baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL_URL, delegate: 'CPU' },
          });
        }

        clearTimeout(loadTimeout);

        if (!active) {
            landmarker.close();
            return;
        }

        landmarkerRef.current = landmarker;
        setIsModelLoaded(true);
        setStatus('Model ready — waiting for camera');
        
      } catch (err) {
        console.error("FaceLandmarker Error:", err);
        clearTimeout(loadTimeout);
        if (active) setStatus('Error loading AI');
      }
    };

    initMediaPipe();

    return () => {
      active = false;
      loopActiveRef.current = false;
      clearTimeout(loadTimeout);
      if (landmarkerRef.current) {
        try { landmarkerRef.current.close(); } catch { /* ignore */ }
        landmarkerRef.current = null;
      }
      if (requestRef.current) {
          cancelAnimationFrame(requestRef.current);
          requestRef.current = 0;
      }
    };
  }, []);

  const onOptionSelectRef = useRef(onOptionSelect);
  const onNextRef = useRef(onNext);
  const onPrevRef = useRef(onPrev);
  /** Latest mirrored nose sample for recenter */
  const latestNoseRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    onOptionSelectRef.current = onOptionSelect;
    onNextRef.current = onNext;
    onPrevRef.current = onPrev;
  }, [onOptionSelect, onNext, onPrev]);

  /** Map tiny nose delta → full screen with deadzone + soft curve */
  const deltaToScreenOffset = (delta: number, halfSpanPx: number) => {
    const sign = delta < 0 ? -1 : 1;
    const mag = Math.abs(delta);
    if (mag < DEADZONE) return 0;
    // normalize remaining motion into 0..1 over HALF_SCREEN_DELTA
    const t = Math.min(1, (mag - DEADZONE) / Math.max(1e-6, HALF_SCREEN_DELTA - DEADZONE));
    // Slightly super-linear near center so micro moves feel present, then soft cap
    const shaped = Math.pow(t, RESPONSE_POWER);
    return sign * shaped * halfSpanPx;
  };

  const snapPointerToCenter = () => {
    const { w, h, left, top } = getViewport();
    const cx = left + w / 2;
    const cy = top + h / 2;
    cursorPosRef.current = { x: cx, y: cy };
    smoothPosRef.current = { x: cx, y: cy };
  };

  /** Recenter: rest pose = current face; pointer jumps to screen center */
  const recenterFromCurrentNose = () => {
    if (latestNoseRef.current) {
      originRef.current = { ...latestNoseRef.current };
    }
    snapPointerToCenter();
    lastNormRef.current = null;
  };

  // Start prediction loop when camera is ready; hard-stop when not
  useEffect(() => {
    if (isCameraReady && isModelLoaded && landmarkerRef.current) {
        setStatus('Nose tracking active');
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
  }, [isCameraReady, isModelLoaded]);

  const predictWebcam = () => {
    if (!loopActiveRef.current) return;
    if (!landmarkerRef.current || !globalVideoRef.current) {
      if (loopActiveRef.current) {
        requestRef.current = requestAnimationFrame(predictWebcam);
      }
      return;
    }

    const video = globalVideoRef.current;
    
    // Safety check
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
        if (loopActiveRef.current) {
          requestRef.current = requestAnimationFrame(predictWebcam);
        }
        return;
    }

    let targetX = cursorPosRef.current.x;
    let targetY = cursorPosRef.current.y;
    let showCursor = false;
    let currentlyHovered: number | string | null = null;
    let currentlyHoveredNav: 'prev' | 'next' | null = null;

    if (video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      let startTimeMs = performance.now();
      const results = landmarkerRef.current.detectForVideo(video, startTimeMs);

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');

      if (canvas && ctx) {
        // Ensure canvas matches video dimensions
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        // --- SMILE DETECTION (BLENDSHAPES) ---
        if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
            const blendshapes = results.faceBlendshapes[0].categories;
            const smileLeft = blendshapes.find((b: any) => b.categoryName === 'mouthSmileLeft')?.score || 0;
            const smileRight = blendshapes.find((b: any) => b.categoryName === 'mouthSmileRight')?.score || 0;
            
            // If both sides of the mouth are smiling significantly
            if (smileLeft > 0.5 && smileRight > 0.5) {
                if (!isSmilingRef.current) {
                    isSmilingRef.current = true;
                    setIsSmiling(true);
                    smileStartTimeRef.current = performance.now();
                    hasSmileTriggeredRef.current = false;
                } else {
                    const smileDuration = performance.now() - smileStartTimeRef.current;
                    if (smileDuration > SMILE_DWELL_DURATION && !hasSmileTriggeredRef.current) {
                        // Recenter: pointer to screen center + origin = current nose (neck-friendly)
                        recenterFromCurrentNose();
                        hasSmileTriggeredRef.current = true;
                        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([50, 50, 50]);
                    }
                }
            } else {
                if (isSmilingRef.current) {
                    isSmilingRef.current = false;
                    setIsSmiling(false);
                }
                hasSmileTriggeredRef.current = false;
            }
        }

        // --- VIP BOX FILTER ---
        let vipFace = null;
        let maxBoxArea = 0;

        for (const landmarks of results.faceLandmarks) {
          let minX = 1, minY = 1, maxX = 0, maxY = 0;
          for (const p of landmarks) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
          }
          const area = (maxX - minX) * (maxY - minY);

          if (area > maxBoxArea) {
            maxBoxArea = area;
            vipFace = landmarks;
          }
        }

        if (vipFace) {
          // Landmark 1 = nose tip
          const nose = vipFace[1];
          const { w: vw, h: vh, left: vLeft, top: vTop } = getViewport();
          const nowT = performance.now();

          // Selfie-mirrored normalized coords
          const mirX = 1 - nose.x;
          const mirY = nose.y;
          latestNoseRef.current = { x: mirX, y: mirY };

          // First lock / auto origin
          if (!originRef.current) {
            originRef.current = { x: mirX, y: mirY };
            snapPointerToCenter();
          }

          const origin = originRef.current;
          let dx = mirX - origin.x;
          let dy = mirY - origin.y;

          // Velocity for adaptive smooth + origin adapt
          let speed = 0;
          if (lastNormRef.current) {
            const dt = Math.max(1, nowT - lastNormRef.current.t) / 1000;
            speed = Math.hypot(mirX - lastNormRef.current.x, mirY - lastNormRef.current.y) / dt;
          }
          lastNormRef.current = { x: mirX, y: mirY, t: nowT };

          // While almost still: gently drift origin toward current pose (neck can relax)
          if (speed < 0.08) {
            origin.x += (mirX - origin.x) * ORIGIN_ADAPT;
            origin.y += (mirY - origin.y) * ORIGIN_ADAPT;
            dx = mirX - origin.x;
            dy = mirY - origin.y;
          }

          // Relative gain → screen (micromovement friendly)
          const halfW = vw / 2;
          const halfH = vh / 2;
          const offX = deltaToScreenOffset(dx, halfW);
          const offY = deltaToScreenOffset(dy, halfH);
          const targetAbsX = vLeft + halfW + offX;
          const targetAbsY = vTop + halfH + offY;

          // Adaptive follow: high alpha = low lag. Still calm when holding aim.
          const velNorm = Math.min(1, speed / VEL_FAST);
          const followBoost = Math.min(0.94, 0.70 + 0.24 * velNorm);
          smoothPosRef.current.x += (targetAbsX - smoothPosRef.current.x) * followBoost;
          smoothPosRef.current.y += (targetAbsY - smoothPosRef.current.y) * followBoost;

          const pad = 6;
          cursorPosRef.current.x = Math.max(vLeft + pad, Math.min(vLeft + vw - pad, smoothPosRef.current.x));
          cursorPosRef.current.y = Math.max(vTop + pad, Math.min(vTop + vh - pad, smoothPosRef.current.y));

          targetX = cursorPosRef.current.x;
          targetY = cursorPosRef.current.y;

          // Preview: free motion — no restrictive frame; show origin + nose
          if (canvas && ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // soft vignette only
            ctx.fillStyle = 'rgba(0,0,0,0.12)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Origin cross (neutral rest)
            const ox = origin.x * canvas.width;
            const oy = origin.y * canvas.height;
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(ox - 10, oy);
            ctx.lineTo(ox + 10, oy);
            ctx.moveTo(ox, oy - 10);
            ctx.lineTo(ox, oy + 10);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(ox, oy, 14, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(167,139,250,0.4)';
            ctx.stroke();

            // Nose tip
            const drawX = mirX * canvas.width;
            const drawY = mirY * canvas.height;
            ctx.fillStyle = '#34d399';
            ctx.beginPath();
            ctx.arc(drawX, drawY, 5, 0, 2 * Math.PI);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.95)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Line origin → nose (shows micro leverage)
            ctx.strokeStyle = 'rgba(52,211,153,0.55)';
            ctx.lineWidth = 1.25;
            ctx.beginPath();
            ctx.moveTo(ox, oy);
            ctx.lineTo(drawX, drawY);
            ctx.stroke();
          }
        }
      }
    }

    showCursor = true;

    // Direct DOM Mutation for Zero Latency
    if (pointerRef.current) {
      const scale = isSmilingRef.current ? 1.12 : 1;
      pointerRef.current.style.transform = `translate3d(${targetX}px, ${targetY}px, 0) translate(-50%, -50%) scale(${scale})`;
      pointerRef.current.style.opacity = showCursor ? '1' : '0';
      const ring = pointerRef.current.firstElementChild as HTMLElement | null;
      if (ring) {
        if (isSmilingRef.current) {
          ring.style.borderColor = '#10b981';
          ring.style.boxShadow = '0 0 0 1px rgba(16,185,129,0.35), 0 0 16px rgba(16,185,129,0.45)';
        } else {
          ring.style.borderColor = 'rgba(255,255,255,0.95)';
          ring.style.boxShadow = '0 0 0 1px rgba(0,0,0,0.2), 0 4px 14px rgba(0,0,0,0.15)';
        }
      }
    }

    const px = targetX;
    const py = targetY;
    const { w: vw, h: vh, top: vTop } = getViewport();
    const now = performance.now();

    /**
     * Priority (fixes stuck-on-option / no-scroll):
     * 1. Top/bottom SCROLL bands — always win (suppress option dwell)
     * 2. Left/right NAV edges
     * 3. Options (stricter hit box)
     */
    const scrollZone = Math.min(72, vh * 0.12);
    const inScrollDown = py >= vTop + vh - scrollZone;
    const inScrollUp = py <= vTop + scrollZone;
    const inScrollBand = inScrollDown || inScrollUp;

    let newScrollState: 'up' | 'down' | null = null;
    if (showCursor && inScrollBand) {
      if (inScrollDown) {
        newScrollState = 'down';
        const intensity = (py - (vTop + vh - scrollZone)) / scrollZone;
        // Prefer scrolling the quiz card if present; else window
        const scroller =
          (document.querySelector('[data-quiz-scroll]') as HTMLElement | null) ||
          document.scrollingElement ||
          document.documentElement;
        const dy = 6 + intensity * 18;
        if (scroller && 'scrollTop' in scroller) {
          scroller.scrollTop += dy;
        } else {
          window.scrollBy({ top: dy, behavior: 'auto' });
        }
      } else if (inScrollUp) {
        newScrollState = 'up';
        const intensity = (vTop + scrollZone - py) / scrollZone;
        const scroller =
          (document.querySelector('[data-quiz-scroll]') as HTMLElement | null) ||
          document.scrollingElement ||
          document.documentElement;
        const dy = -(6 + intensity * 18);
        if (scroller && 'scrollTop' in scroller) {
          scroller.scrollTop += dy;
        } else {
          window.scrollBy({ top: dy, behavior: 'auto' });
        }
      }
    }

    if (newScrollState !== lastScrollStateRef.current) {
      lastScrollStateRef.current = newScrollState;
      setHoveredScroll(newScrollState);
    }

    // While scrolling intent is active: clear option/nav hover so dwell cannot fire
    if (inScrollBand) {
      currentlyHovered = null;
      currentlyHoveredNav = null;
    } else {
      // Prev / Next: full-height side strips
      const edgeWidth = Math.min(56, Math.max(40, vw * 0.07));
      if (px <= edgeWidth) currentlyHoveredNav = 'prev';
      else if (px >= vw - edgeWidth) currentlyHoveredNav = 'next';

      // Options only if not on nav edge
      if (currentlyHoveredNav === null && showCursor) {
        const optionElements = document.querySelectorAll(
          '[data-option-index], [data-nose-action]'
        );
        let best: { el: Element; area: number } | null = null;
        optionElements.forEach((el) => {
          const rect = el.getBoundingClientRect();
          // Larger inset — must aim at center of option, not graze border
          const insetX = Math.min(18, rect.width * 0.12);
          const insetY = Math.min(14, rect.height * 0.18);
          if (
            px >= rect.left + insetX &&
            px <= rect.right - insetX &&
            py >= rect.top + insetY &&
            py <= rect.bottom - insetY
          ) {
            const area = rect.width * rect.height;
            if (!best || area < best.area) best = { el, area };
          }
        });
        if (best) {
          const el = best.el;
          if (el.hasAttribute('data-option-index')) {
            currentlyHovered = parseInt(el.getAttribute('data-option-index') || '-1', 10);
          } else if (el.hasAttribute('data-nose-action')) {
            currentlyHovered = el.getAttribute('data-nose-action') as any;
          }
        }
      }
    }

    // 1. Navigation Hitboxes
    if (currentlyHoveredNav !== null) {
      if (currentHoveredNavRef.current === currentlyHoveredNav) {
        const duration = now - navHoverStartTimeRef.current;
        const progress = Math.min(100, (duration / NAV_DWELL_DURATION) * 100);
        
        setNavDwellProgress(progress);

        if (duration >= NAV_DWELL_DURATION && !hasNavTriggeredRef.current) {
          hasNavTriggeredRef.current = true;
          if (currentlyHoveredNav === 'next') onNextRef.current();
          if (currentlyHoveredNav === 'prev') onPrevRef.current();
          if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([50, 50, 50]);
        }
      } else {
        currentHoveredNavRef.current = currentlyHoveredNav;
        navHoverStartTimeRef.current = now;
        hasNavTriggeredRef.current = false;
        setHoveredNav(currentlyHoveredNav);
        setNavDwellProgress(0);
      }
    } else {
      if (currentHoveredNavRef.current !== null) {
        currentHoveredNavRef.current = null;
        hasNavTriggeredRef.current = false;
        setHoveredNav(null);
        setNavDwellProgress(0);
      }
    }

    // 2. Options & Actions Hitboxes
    if (currentlyHovered !== null) {
      if (currentHoveredOptionRef.current === currentlyHovered) {
        const duration = now - hoverStartTimeRef.current;
        const progress = Math.min(100, (duration / DWELL_DURATION) * 100);
        
        setDwellProgress(progress);

        if (duration >= DWELL_DURATION && !hasTriggeredRef.current) {
          hasTriggeredRef.current = true;
          if (typeof currentlyHovered === 'number') {
            onOptionSelectRef.current(currentlyHovered);
          } else if (currentlyHovered === 'reset') {
            recenterFromCurrentNose();
          }
          if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([50, 50, 50]);
        }
      } else {
        currentHoveredOptionRef.current = currentlyHovered;
        hoverStartTimeRef.current = now;
        hasTriggeredRef.current = false;
        setHoveredOption(currentlyHovered);
        setDwellProgress(0);
      }
    } else {
      if (currentHoveredOptionRef.current !== null) {
        currentHoveredOptionRef.current = null;
        hasTriggeredRef.current = false;
        setHoveredOption(null);
        setDwellProgress(0);
      }
    }

    if (loopActiveRef.current) {
      requestRef.current = requestAnimationFrame(predictWebcam);
    }
  };

  // Keyboard shortcut: recenter origin on current pose (comfort)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        recenterFromCurrentNose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Option highlight: ring + soft border only (never paint text over / scale sloppy)
  useEffect(() => {
    const optionElements = document.querySelectorAll('[data-option-index]');
    optionElements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      const idx = parseInt(htmlEl.getAttribute('data-option-index') || '-1', 10);
      // ensure host can pin a badge
      if (getComputedStyle(htmlEl).position === 'static') {
        htmlEl.style.position = 'relative';
      }
      let badge = htmlEl.querySelector('[data-dwell-badge]') as HTMLElement | null;
      if (idx === hoveredOption && typeof hoveredOption === 'number') {
        htmlEl.style.boxShadow = '0 0 0 2px rgba(16,185,129,0.55), 0 8px 24px rgba(16,185,129,0.12)';
        htmlEl.style.borderColor = 'rgba(16,185,129,0.45)';
        if (!badge) {
          badge = document.createElement('div');
          badge.setAttribute('data-dwell-badge', '1');
          badge.style.cssText =
            'position:absolute;top:10px;right:10px;z-index:5;pointer-events:none;';
          htmlEl.appendChild(badge);
        }
        // progress via CSS variable for the ring drawn in React portal instead —
        // keep DOM badge as thin bar only
        badge.innerHTML = '';
        const bar = document.createElement('div');
        bar.style.cssText =
          'width:36px;height:3px;border-radius:999px;background:rgba(226,232,240,0.95);overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,0.06)';
        const fill = document.createElement('div');
        fill.style.cssText = `height:100%;width:${dwellProgress}%;background:linear-gradient(90deg,#34d399,#10b981);border-radius:999px;transition:width 50ms linear`;
        bar.appendChild(fill);
        badge.appendChild(bar);
      } else {
        htmlEl.style.boxShadow = '';
        htmlEl.style.borderColor = '';
        if (badge) badge.remove();
      }
    });
  }, [hoveredOption, dwellProgress]);

  const resetPointer = () => recenterFromCurrentNose();
  const id = getLocale() === 'id';

  const dwellTitle =
    typeof hoveredOption === 'number'
      ? id
        ? `Pilihan ${['A', 'B', 'C', 'D'][hoveredOption] || hoveredOption + 1}`
        : `Option ${['A', 'B', 'C', 'D'][hoveredOption] || hoveredOption + 1}`
      : hoveredNav === 'next'
        ? id
          ? 'Lanjut'
          : 'Next'
        : hoveredNav === 'prev'
          ? id
            ? 'Kembali'
            : 'Back'
          : '';

  const dwellGlyph =
    typeof hoveredOption === 'number'
      ? ['A', 'B', 'C', 'D'][hoveredOption] || String(hoveredOption + 1)
      : hoveredNav === 'next'
        ? '→'
        : hoveredNav === 'prev'
          ? '←'
          : '';

  const activeDwell =
    typeof hoveredOption === 'number'
      ? dwellProgress
      : hoveredNav
        ? navDwellProgress
        : 0;

  const showDwellHud =
    (typeof hoveredOption === 'number' && dwellProgress > 0) ||
    (hoveredNav !== null && navDwellProgress > 0);

  // Portal to body so Framer Motion transform ancestors cannot trap `fixed`
  const ui = (
    <>
      {/* Top status — glass, not loud emerald brick */}
      <div
        className="fixed z-[300] pointer-events-none flex items-center gap-2"
        style={{
          top: 'max(0.75rem, env(safe-area-inset-top))',
          left: 'max(0.75rem, env(safe-area-inset-left))',
        }}
      >
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-white/80 shadow-lg text-[11px] font-medium text-slate-700 dark:text-slate-200 tracking-tight">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          {status}
        </div>
      </div>

      <div
        className="fixed z-[300] pointer-events-none"
        style={{
          top: 'max(0.75rem, env(safe-area-inset-top))',
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      >
        <div className="px-3 py-1.5 rounded-full bg-slate-900/85 backdrop-blur-md text-white/90 text-[11px] font-medium tracking-tight shadow-lg border border-white/10">
          {isSmiling
            ? id
              ? '😊 Menyetel ulang pose…'
              : '😊 Recentering…'
            : id
              ? 'Gerakan kecil · Senyum / R = istirahat'
              : 'Micro-move · Smile / R = rest'}
        </div>
      </div>

      <button
        type="button"
        onClick={resetPointer}
        className="fixed z-[300] px-3 py-1.5 rounded-xl bg-white/95 backdrop-blur border border-slate-200/80 text-slate-700 text-[11px] font-semibold tracking-tight shadow-lg hover:bg-emerald-50 pointer-events-auto transition-colors"
        style={{
          top: 'max(0.75rem, env(safe-area-inset-top))',
          right: 'max(0.75rem, env(safe-area-inset-right))',
        }}
      >
        {id ? 'Recenter' : 'Recenter'}
      </button>

      {/* Floating dwell card — same language as hand mode */}
      <div
        className="fixed z-[360] pointer-events-none"
        style={{
          top: 'max(3.5rem, calc(env(safe-area-inset-top) + 2.75rem))',
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      >
        <AnimatePresence mode="wait">
          {showDwellHud && (
            <DwellIndicator
              key={`${hoveredOption}-${hoveredNav}`}
              progress={activeDwell}
              glyph={dwellGlyph}
              title={dwellTitle}
              subtitle={
                activeDwell >= 100
                  ? id
                    ? 'Terkonfirmasi'
                    : 'Confirmed'
                  : id
                    ? 'Tahan untuk konfirmasi'
                    : 'Hold to confirm'
              }
              tone={hoveredNav ? 'indigo' : 'emerald'}
              showPercent
            />
          )}
        </AnimatePresence>
      </div>

      {/* GHOST POINTER — ring progress lives on pointer, not on option text */}
      <div
        ref={pointerRef}
        className="fixed top-0 left-0 pointer-events-none z-[400] flex items-center justify-center"
        style={{
          width: 36,
          height: 36,
          willChange: 'transform',
          opacity: 0,
        }}
      >
        <div
          className="absolute inset-0 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.2),0_4px_14px_rgba(0,0,0,0.15)]"
          style={{ backdropFilter: 'invert(1)' }}
        />
        {showDwellHud && (
          <div className="absolute -top-1 -right-1">
            <DwellRingBadge
              progress={activeDwell}
              tone={hoveredNav ? 'indigo' : 'emerald'}
              size={22}
            />
          </div>
        )}
      </div>

      {/* Prev/Next edges — thin rail + label pill, not full wash */}
      <div
        className={`fixed inset-y-0 left-0 w-12 pointer-events-none z-[350] flex flex-col items-center justify-center gap-2 transition-opacity duration-200 ${
          hoveredNav === 'prev' ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="absolute inset-y-8 left-0 w-1 rounded-full bg-slate-200/80 overflow-hidden">
          <div
            className="absolute bottom-0 left-0 right-0 bg-indigo-500 transition-[height] duration-75"
            style={{ height: `${navDwellProgress}%` }}
          />
        </div>
        <span className="text-[10px] font-semibold tracking-wide text-indigo-600 bg-white/90 px-2 py-1 rounded-lg shadow border border-indigo-100">
          {id ? 'Kembali' : 'Back'}
        </span>
      </div>

      <div
        className={`fixed inset-y-0 right-0 w-12 pointer-events-none z-[350] flex flex-col items-center justify-center gap-2 transition-opacity duration-200 ${
          hoveredNav === 'next' ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="absolute inset-y-8 right-0 w-1 rounded-full bg-slate-200/80 overflow-hidden">
          <div
            className="absolute bottom-0 left-0 right-0 bg-indigo-500 transition-[height] duration-75"
            style={{ height: `${navDwellProgress}%` }}
          />
        </div>
        <span className="text-[10px] font-semibold tracking-wide text-indigo-600 bg-white/90 px-2 py-1 rounded-lg shadow border border-indigo-100">
          {id ? 'Lanjut' : 'Next'}
        </span>
      </div>

      {/* Scroll hints — subtle, not shouting */}
      <div
        className={`fixed top-0 left-0 w-full h-10 pointer-events-none z-[340] transition-opacity duration-200 flex justify-center items-start pt-1.5 ${
          hoveredScroll === 'up' ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <span className="text-[10px] font-medium text-emerald-700/80 bg-white/80 px-2.5 py-0.5 rounded-full border border-emerald-100 shadow-sm tracking-tight">
          {id ? 'Gulir atas' : 'Scroll up'}
        </span>
      </div>

      <div
        className={`fixed bottom-0 left-0 w-full h-10 pointer-events-none z-[340] transition-opacity duration-200 flex justify-center items-end pb-1.5 ${
          hoveredScroll === 'down' ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <span className="text-[10px] font-medium text-emerald-700/80 bg-white/80 px-2.5 py-0.5 rounded-full border border-emerald-100 shadow-sm tracking-tight">
          {id ? 'Gulir bawah' : 'Scroll down'}
        </span>
      </div>

      {/* Camera preview */}
      <div
        className="fixed z-[300] w-[9.5rem] h-[7.25rem] md:w-[12.5rem] md:h-[9.25rem] rounded-[1.25rem] overflow-hidden border border-white/25 shadow-2xl bg-slate-950 ring-1 ring-emerald-400/35"
        style={{
          right: 'max(0.75rem, env(safe-area-inset-right))',
          bottom: 'max(5.5rem, calc(env(safe-area-inset-bottom) + 4.5rem))',
        }}
      >
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-contain transform -scale-x-100 bg-black"
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-contain transform -scale-x-100"
        />
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/75 to-transparent px-2 py-1.5">
          <p className="text-[9px] text-white/80 font-medium text-center leading-snug tracking-tight">
            {id
              ? 'Silang = istirahat · tepi kiri/kanan = navigasi'
              : 'Cross = rest · side edges = navigate'}
          </p>
        </div>
      </div>
    </>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(ui, document.body);
};
