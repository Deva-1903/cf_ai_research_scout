import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy REST API calls to the local worker during development
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
      // Proxy WebSocket agent connections to the local worker
      "/agents": {
        target: "http://localhost:8787",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
