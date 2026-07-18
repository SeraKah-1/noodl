import React, { createContext, useContext, useRef, useState, useEffect, useCallback } from 'react';

/** Hands-free input mode. Only one of HAND / NOSE may be active. */
export type CameraMode = 'OFF' | 'NOSE' | 'HAND';

interface CameraContextType {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isCameraReady: boolean;
  error: string | null;
  mode: CameraMode;
  setMode: (mode: CameraMode) => void;
  /** Force stop regardless of mode (e.g. leaving quiz). */
  forceStop: () => void;
  stream: MediaStream | null;
}

const CameraContext = createContext<CameraContextType | null>(null);

export const useCamera = () => {
  const context = useContext(CameraContext);
  if (!context) {
    throw new Error('useCamera must be used within a CameraProvider');
  }
  return context;
};

export const CameraProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // React state for UI consumers
  const [stream, setStream] = useState<MediaStream|null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setModeState] = useState<CameraMode>('OFF');

  // Refs avoid stale closures / races between getUserMedia and OFF
  const streamRef = useRef<MediaStream | null>(null);
  const modeRef = useRef<CameraMode>('OFF');
  /** Monotonic generation — increment to invalidate in-flight starts */
  const startGenRef = useRef(0);
  const startingRef = useRef(false);

  const detachVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    try {
      video.pause();
    } catch { /* ignore */ }
    video.srcObject = null;
  }, []);

  const stopTracks = useCallback((s: MediaStream | null) => {
    if (!s) return;
    try {
      s.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch { /* ignore */ }
      });
    } catch { /* ignore */ }
  }, []);

  const stopCamera = useCallback(() => {
    // Invalidate any in-flight getUserMedia so it discards the stream on resolve
    startGenRef.current += 1;
    startingRef.current = false;

    const current = streamRef.current;
    streamRef.current = null;
    stopTracks(current);
    detachVideo();
    setStream(null);
    setIsCameraReady(false);
  }, [detachVideo, stopTracks]);

  const startCamera = useCallback(async () => {
    // Already have a live stream
    if (streamRef.current) {
      const live = streamRef.current.getTracks().some((t) => t.readyState === 'live');
      if (live) {
        setIsCameraReady(true);
        return;
      }
      // Dead stream left behind — clean up
      stopTracks(streamRef.current);
      streamRef.current = null;
      setStream(null);
    }

    if (startingRef.current) return;
    startingRef.current = true;
    const myGen = ++startGenRef.current;

    try {
      setError(null);
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
          frameRate: { ideal: 24, max: 30 },
        },
        audio: false,
      });

      // Aborted / mode flipped OFF / newer start while we waited
      if (myGen !== startGenRef.current || modeRef.current === 'OFF') {
        stopTracks(newStream);
        startingRef.current = false;
        return;
      }

      // Replace any leftover stream
      if (streamRef.current && streamRef.current !== newStream) {
        stopTracks(streamRef.current);
      }

      streamRef.current = newStream;
      setStream(newStream);

      const video = videoRef.current;
      if (video) {
        video.srcObject = newStream;
        video.muted = true;
        video.playsInline = true;

        await new Promise<void>((resolve) => {
          if (video.readyState >= 1) {
            resolve();
            return;
          }
          const onMeta = () => {
            video.removeEventListener('loadedmetadata', onMeta);
            resolve();
          };
          video.addEventListener('loadedmetadata', onMeta);
          // Safety timeout so we never hang forever
          setTimeout(() => {
            video.removeEventListener('loadedmetadata', onMeta);
            resolve();
          }, 3000);
        });

        // Mode may have flipped OFF during metadata wait
        if (myGen !== startGenRef.current || modeRef.current === 'OFF') {
          stopTracks(newStream);
          if (streamRef.current === newStream) streamRef.current = null;
          setStream(null);
          detachVideo();
          startingRef.current = false;
          setIsCameraReady(false);
          return;
        }

        try {
          await video.play();
        } catch (playErr) {
          console.warn('[Camera] video.play() failed:', playErr);
        }
      }

      if (myGen !== startGenRef.current || modeRef.current === 'OFF') {
        stopTracks(newStream);
        if (streamRef.current === newStream) streamRef.current = null;
        setStream(null);
        detachVideo();
        setIsCameraReady(false);
      } else {
        setIsCameraReady(true);
      }
    } catch (err) {
      console.error('[Camera] Start error:', err);
      if (myGen === startGenRef.current) {
        setError('Could not access camera. Check browser permission.');
        modeRef.current = 'OFF';
        setModeState('OFF');
        setIsCameraReady(false);
      }
    } finally {
      if (myGen === startGenRef.current) {
        startingRef.current = false;
      }
    }
  }, [detachVideo, stopTracks]);

  const setMode = useCallback(
    (next: CameraMode) => {
      // Normalize legacy aliases
      const normalized: CameraMode =
        (next as string) === 'EYE' ? 'NOSE' : next;

      if (modeRef.current === normalized) {
        // Re-assert stop if UI says OFF but stream still live (stuck state recovery)
        if (normalized === 'OFF' && streamRef.current) {
          stopCamera();
        }
        return;
      }

      modeRef.current = normalized;
      setModeState(normalized);

      if (normalized === 'OFF') {
        stopCamera();
      } else {
        // HAND ↔ NOSE: keep stream if already live; only start if needed
        void startCamera();
      }
    },
    [startCamera, stopCamera]
  );

  const forceStop = useCallback(() => {
    modeRef.current = 'OFF';
    setModeState('OFF');
    stopCamera();
  }, [stopCamera]);

  // Safety: if mode is OFF but a stream somehow appears, kill it
  useEffect(() => {
    if (mode === 'OFF' && stream) {
      stopCamera();
    }
  }, [mode, stream, stopCamera]);

  // Unmount cleanup
  useEffect(() => {
    return () => {
      startGenRef.current += 1;
      startingRef.current = false;
      stopTracks(streamRef.current);
      streamRef.current = null;
    };
  }, [stopTracks]);

  // Pause when tab hidden (saves battery); resume only if mode still active
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        // Do not stop tracks (permission / restart cost) — just pause prediction consumers via ready flag
        // Consumers already gate on isCameraReady; keep stream.
        return;
      }
      if (modeRef.current !== 'OFF' && streamRef.current && videoRef.current) {
        void videoRef.current.play().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  return (
    <CameraContext.Provider
      value={{
        videoRef,
        canvasRef,
        isCameraReady,
        error,
        mode,
        setMode,
        forceStop,
        stream,
      }}
    >
      {children}
      {/* Single global capture element — previews clone via srcObject */}
      <video
        ref={videoRef}
        style={{ position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none', left: -9999, top: 0 }}
        playsInline
        muted
        autoPlay
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </CameraContext.Provider>
  );
};
