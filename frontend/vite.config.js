import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { buildInfo } from "../scripts/build-info.mjs";
import { resolveAppProfile } from "./src/appProfile.js";

const backend = "http://127.0.0.1:3001";

export default defineConfig(({ mode, command }) => ({
  plugins: [react(), {
    name: "mazestream-build-info",
    generateBundle() {
      const env = loadEnv(mode, process.cwd(), "VITE_MAZESTREAM_PROFILE");
      const profile = resolveAppProfile(env.VITE_MAZESTREAM_PROFILE, command === "build");
      this.emitFile({ type: "asset", fileName: "build-info.json", source: JSON.stringify(buildInfo(profile.id), null, 2) + "\n" });
    }
  }],
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1500
  },
  server: {
    proxy: {
      "/token": { target: backend, changeOrigin: true },
      "/api": { target: backend, changeOrigin: true },
      "/shared": { target: backend, changeOrigin: true }
    }
  }
}));
