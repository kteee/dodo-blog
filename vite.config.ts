import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // 투두(5175)·북로그(5177)·홈(5178)과 동시에 띄울 수 있게 다른 포트
  server: { port: 5180, strictPort: true },
});
