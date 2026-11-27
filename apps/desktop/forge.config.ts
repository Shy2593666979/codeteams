import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerZIP } from "@electron-forge/maker-zip";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { resolve } from "node:path";
import { ensureElectronForForge } from "./ensure-electron";
import { devExecutablePlugin } from "./dev-executable";

const config: ForgeConfig = {
  hooks: {
    generateAssets: async () => {
      ensureElectronForForge(__dirname);
    },
  },
  packagerConfig: {
    name: "CodeTeams",
    executableName: "codeteams",
    icon: resolve(__dirname, "resources", "app-icon"),
    asar: true,
    extraResource: [
      resolve(__dirname, "resources", "bin"),
      resolve(__dirname, "resources", "app-icon.png"),
      resolve(__dirname, "resources", "app-icon.ico"),
      resolve(__dirname, "..", "..", "resources", "agents"),
    ],
  },
  makers: [new MakerZIP({})],
  plugins: [
    devExecutablePlugin,
    new VitePlugin({
      build: [
        {
          entry: "src/main/index.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/preload/index.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts",
        },
      ],
    }),
  ],
};

export default config;
