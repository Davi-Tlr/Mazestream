import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backend = "http://127.0.0.1:3001";

export default defineConfig({
  plugins: [react()],
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
});
