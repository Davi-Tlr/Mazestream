import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1500
  },
  server: {
    proxy: {
      "/token": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true
      }
    }
  }
});
