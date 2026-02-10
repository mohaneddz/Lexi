/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly GROQ_API?: string;
  readonly GROQ_API?: string;
  readonly MODEL?: string;
  readonly VITE_GROQ_API?: string;
  readonly VITE_GROQ_API?: string;
  readonly VITE_GROQ_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
