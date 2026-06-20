import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    allowedHosts: [".trycloudflare.com", ".up.railway.app"],
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    // Circle's w3s-pw-web-sdk (email/PIN) pulls Node deps (jsonwebtoken, util,
    // stream, Buffer). Polyfill them for the browser so the email flow doesn't
    // throw "Object prototype may only be an Object or null".
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
      protocolImports: true,
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "wagmi"],
  },
}));
