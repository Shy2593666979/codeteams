import { builtinModules } from "node:module";
import { defineConfig } from "vite";
import { resolve } from "node:path";

const nodeExternals = [
  "electron",
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
];

export default defineConfig({
  ssr: {
    noExternal: true,
    external: nodeExternals,
  },
  build: {
    outDir: ".vite/build",
    emptyOutDir: false,
    ssr: resolve(__dirname, "src/main/index.ts"),
    rollupOptions: {
      external: nodeExternals,
      output: {
        format: "cjs",
        entryFileNames: "main.js",
      },
    },
    target: "node22",
    sourcemap: true,
  },
  resolve: {
    alias: {
      "@codeteams/shared": resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
});
