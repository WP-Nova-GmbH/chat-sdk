/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_NOVA_PUBLIC_SURFACE_ID?: string;
    readonly VITE_NOVA_BASE_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
