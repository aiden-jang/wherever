/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL for the Worker API in production, e.g. https://api.example.com. Empty in dev (Vite proxy). */
  readonly VITE_API_BASE?: string;
  /** WebSocket base in production, e.g. wss://api.example.com. Defaults to the current host. */
  readonly VITE_WS_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
