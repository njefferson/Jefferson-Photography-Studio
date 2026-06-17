import { defineConfig } from "vite";

// Offline-first PWA, no framework. Relative base so it runs from any path
// (incl. "Add to Home Screen" on the iPad).
export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
    sourcemap: true,
  },
});
