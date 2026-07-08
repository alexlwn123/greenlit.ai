import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  envPrefix: ["VITE_", "CLERK_PUBLISHABLE_KEY", "CONVEX_URL", "GREENLIT_AUTH_DRIVER"],
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
  test: {
    css: true,
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
})
