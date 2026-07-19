import { FilesetResolver } from '@mediapipe/tasks-vision';

// Keep the runtime and npm package on the same version. FilesetResolver selects
// the appropriate SIMD/non-SIMD pair and initializes MediaPipe's ModuleFactory;
// passing the module JS and WASM URLs directly does not perform that bootstrap.
const VISION_WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';

let visionFilesetPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;

export const getVisionFileset = () => {
  if (!visionFilesetPromise) {
    visionFilesetPromise = FilesetResolver.forVisionTasks(VISION_WASM_ROOT).catch((error) => {
      visionFilesetPromise = null;
      throw error;
    });
  }
  return visionFilesetPromise;
};
