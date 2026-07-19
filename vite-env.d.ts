/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Baked at build time in vite.config.ts — compared to /version.json at runtime. */
declare const __NOODL_BUILD_ID__: string;

declare var process: {
  env: {
    API_KEY?: string;
    GEMINI_API_KEY?: string;
    VITE_USE_VERTEX_AI?: string;
    VITE_GCP_PROJECT_ID?: string;
    VITE_GCP_LOCATION?: string;
    VITE_VERTEX_API_KEY?: string;
  }
};
