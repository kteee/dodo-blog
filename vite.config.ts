import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * 배포 주소가 dododiary.com 바로 밑(/@아이디, /blog/…)이라 에셋은 /blog/assets/… 로 (두두 홈과 안 겹치게).
 * 개발 서버는 base 때문에 /blog/ 밑만 알므로, /@… 요청은 index.html 로 넘기고 / 는 /blog 로 보낸다
 * (배포에선 Cloudflare 라우트 + SPA 폴백이 같은 일을 함).
 */
function blogRoutesDev(): Plugin {
  return {
    name: "blog-routes-dev",
    configureServer(server) {
      server.middlewares.use((raw, _res, next) => {
        // @types/node 없이 쓰려고 필요한 칸만
        const req = raw as unknown as { url?: string };
        const url = req.url ?? "";
        if (url === "/" || url === "") {
          _res.statusCode = 302;
          _res.setHeader("Location", "/blog");
          _res.end();
          return;
        }
        // Vite 개발 서버는 base 와 딱 맞는 /blog(슬래시 없음)엔 안내 페이지를 띄움 → 같은 index.html 로
        if (url.startsWith("/@") || url === "/blog" || url.startsWith("/blog?")) req.url = "/blog/index.html";
        next();
      });
    },
  };
}

export default defineConfig({
  base: "/blog/",
  plugins: [react(), blogRoutesDev()],
  // 투두(5175)·북로그(5177)·홈(5178)과 동시에 띄울 수 있게 다른 포트
  server: { port: 5180, strictPort: true },
});
