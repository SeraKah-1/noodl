import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCamera } from '../contexts/CameraContext';

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
  const DWELL_DURATION = 850; // slightly snappier commit

  const navHoverStartTimeRef = useRef<number>(0);
  const currentHoveredNavRef = useRef<'prev' | 'next' | null>(null);
  const hasNavTriggeredRef = useRef<boolean>(false);
  const NAV_DWELL_DURATION = 900; // edges should feel quick

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

        // @ts-ignore
        const { FilesetResolver, FaceLandmarker } = await import("https://esm.sh/@mediapipe/tasks-vision@0.10.17");
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm"
        );

        if (!active) return;

        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numFaces: 1, 
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          outputFaceBlendshapes: true
        });

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
      pointerRef.current.style.transform = `translate3d(${targetX}px, ${targetY}px, 0) translate(-50%, -50%)`;
      pointerRef.current.style.opacity = showCursor ? '1' : '0';
      
      if (isSmilingRef.current) {
          pointerRef.current.style.borderColor = '#10b981';
          pointerRef.current.style.boxShadow = '0 0 15px rgba(16, 185, 129, 0.8)';
          pointerRef.current.style.transform += ' scale(1.2)';
      } else {
          pointerRef.current.style.borderColor = 'rgba(255,255,255,0.9)';
          pointerRef.current.style.boxShadow = '0 0 0 1px rgba(0,0,0,0.25)';
      }
    }

    const px = targetX;
    const py = targetY;
    const { w: vw, h: vh } = getViewport();

    // --- COLLISION: options first (so bottom options beat scroll/nav steal) ---
    const now = performance.now();
    let hoveringOption = false;

    if (showCursor) {
      const optionElements = document.querySelectorAll('[data-option-index], [data-nose-action]');
      optionElements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        // Slight inset so border grazing is less accidental
        const inset = 4;
        if (
          px >= rect.left + inset &&
          px <= rect.right - inset &&
          py >= rect.top + inset &&
          py <= rect.bottom - inset
        ) {
          hoveringOption = true;
          if (el.hasAttribute('data-option-index')) {
            currentlyHovered = parseInt(el.getAttribute('data-option-index') || '-1', 10);
          } else if (el.hasAttribute('data-nose-action')) {
            currentlyHovered = el.getAttribute('data-nose-action') as any;
          }
        }
      });
    }

    // --- AUTO SCROLL (only when NOT on an option; smaller zones so bottom is usable) ---
    let newScrollState: 'up' | 'down' | null = null;
    if (showCursor && !hoveringOption) {
      const scrollZone = Math.min(56, vh * 0.08); // ~8% or 56px max — was 15% and blocked bottom
      if (py > vh - scrollZone) {
        newScrollState = 'down';
        const intensity = (py - (vh - scrollZone)) / scrollZone;
        window.scrollBy({ top: intensity * 10, behavior: 'auto' });
      } else if (py < scrollZone) {
        newScrollState = 'up';
        const intensity = (scrollZone - py) / scrollZone;
        window.scrollBy({ top: -intensity * 10, behavior: 'auto' });
      }
    }
    
    if (newScrollState !== lastScrollStateRef.current) {
        lastScrollStateRef.current = newScrollState;
        setHoveredScroll(newScrollState);
    }

    // Prev / Next: full-height side strips (any vertical position — no mid-band limit)
    const edgeWidth = Math.min(56, Math.max(40, vw * 0.07));
    if (!hoveringOption) {
      if (px <= edgeWidth) currentlyHoveredNav = 'prev';
      else if (px >= vw - edgeWidth) currentlyHoveredNav = 'next';
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

  // --- APPLY VISUAL FEEDBACK ---
  useEffect(() => {
    const optionElements = document.querySelectorAll('[data-option-index]');
    
    optionElements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      const idx = parseInt(htmlEl.getAttribute('data-option-index') || '-1', 10);
      
      if (idx === hoveredOption) {
        htmlEl.style.background = `linear-gradient(to right, rgba(16, 185, 129, 0.2) ${dwellProgress}%, transparent ${dwellProgress}%)`;
        htmlEl.style.transform = `scale(${1 + (dwellProgress / 100) * 0.05})`;
        htmlEl.style.transition = 'none';
      } else {
        htmlEl.style.background = '';
        htmlEl.style.transform = '';
        htmlEl.style.transition = 'all 0.2s ease';
      }
    });
  }, [hoveredOption, dwellProgress]);

  const resetPointer = () => recenterFromCurrentNose();

  // Portal to body so Framer Motion transform ancestors cannot trap `fixed`
  const ui = (
    <>
      <div
        className="fixed z-[300] bg-emerald-500 text-white px-3 py-1.5 rounded-xl shadow-lg text-[11px] font-bold flex items-center gap-2 pointer-events-none"
        style={{ top: 'max(0.75rem, env(safe-area-inset-top))', left: 'max(0.75rem, env(safe-area-inset-left))' }}
      >
        <span className="animate-pulse">👃</span>
        {status}
      </div>

      <div
        className="fixed z-[300] flex gap-2 pointer-events-none"
        style={{
          top: 'max(0.75rem, env(safe-area-inset-top))',
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      >
        <div className="bg-slate-900/90 text-white px-3 py-1.5 rounded-full shadow-lg text-[11px] font-bold flex items-center gap-2">
          {isSmiling ? (
            <span className="text-emerald-300">😊 Recenter…</span>
          ) : (
            <span>Micro-move neck · Smile/R = rest pose</span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={resetPointer}
        className="fixed z-[300] bg-white/95 backdrop-blur border border-slate-200 text-slate-700 px-3 py-2 rounded-xl shadow text-xs font-bold hover:bg-emerald-50 pointer-events-auto"
        style={{
          top: 'max(0.75rem, env(safe-area-inset-top))',
          right: 'max(0.75rem, env(safe-area-inset-right))',
        }}
      >
        Recenter
      </button>

      {/* GHOST POINTER */}
      <div
        ref={pointerRef}
        className="fixed top-0 left-0 pointer-events-none z-[400]"
        style={{
          width: '28px',
          height: '28px',
          border: '2.5px solid rgba(255,255,255,0.95)',
          backdropFilter: 'invert(1)',
          borderRadius: '50%',
          opacity: 0,
          transition: 'opacity 0.2s ease',
          willChange: 'transform',
        }}
      />

      {/* Prev/Next — full height edges (any vertical position) */}
      <div
        className={`fixed inset-y-0 left-0 w-14 pointer-events-none z-[350] transition-opacity duration-200 flex items-center justify-start pl-1 ${
          hoveredNav === 'prev' ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          background: `linear-gradient(to right, rgba(99, 102, 241, 0.32) ${navDwellProgress}%, transparent ${navDwellProgress}%)`,
        }}
      >
        <div className="text-indigo-500 font-bold text-xs opacity-80 rotate-0">PREV</div>
      </div>

      <div
        className={`fixed inset-y-0 right-0 w-14 pointer-events-none z-[350] transition-opacity duration-200 flex items-center justify-end pr-1 ${
          hoveredNav === 'next' ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          background: `linear-gradient(to left, rgba(99, 102, 241, 0.32) ${navDwellProgress}%, transparent ${navDwellProgress}%)`,
        }}
      >
        <div className="text-indigo-500 font-bold text-xs opacity-80">NEXT</div>
      </div>

      {/* Thin scroll hints (8% zones) */}
      <div
        className={`fixed top-0 left-0 w-full h-14 pointer-events-none z-[340] transition-opacity duration-200 flex justify-center items-start pt-2 ${
          hoveredScroll === 'up' ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ background: 'linear-gradient(to bottom, rgba(16, 185, 129, 0.18), transparent)' }}
      >
        <div className="text-emerald-600 font-bold text-[10px] opacity-80">SCROLL UP</div>
      </div>

      <div
        className={`fixed bottom-0 left-0 w-full h-14 pointer-events-none z-[340] transition-opacity duration-200 flex justify-center items-end pb-2 ${
          hoveredScroll === 'down' ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ background: 'linear-gradient(to top, rgba(16, 185, 129, 0.18), transparent)' }}
      >
        <div className="text-emerald-600 font-bold text-[10px] opacity-80">SCROLL DOWN</div>
      </div>

      {/* Camera preview — viewport-fixed, above bottom chrome, object-contain for 1:1 guide */}
      <div
        className="fixed z-[300] w-[9.5rem] h-[7.25rem] md:w-[12.5rem] md:h-[9.5rem] rounded-2xl overflow-hidden border-2 border-emerald-400 shadow-2xl bg-black ring-2 ring-emerald-500/25"
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
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1">
          <p className="text-[8px] text-white font-semibold text-center leading-tight">
            Tiny neck moves · white cross = rest · left/right edge = prev/next
          </p>
        </div>
      </div>
    </>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(ui, document.body);
};
