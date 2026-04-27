import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { ports } from "@template/configs/ports";

export default defineConfig({
  plugins: [react()],
  server: {
    port: ports.dashboard,
  },
});
