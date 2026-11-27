import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "codeteams-csp-preamble",
      apply: "serve",
      // React's inline refresh setup is blocked by Electron's script-src 'self'.
      // main.tsx imports the same setup as an external module, before the app.
      transformIndexHtml: {
        order: "post",
        handler: (html) => html.replace(
          /<script\b[^>]*>([\s\S]*?)<\/script>/g,
          (tag, content: string) => content.includes("injectIntoGlobalHook") ? "" : tag,
        ),
      },
    },
  ],
  build: {
    outDir: ".vite/renderer/main_window",
    emptyOutDir: true,
    sourcemap: true,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src/renderer"),
      "@codeteams/shared": resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
