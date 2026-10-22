// 빌드 뒤 정리 — Cloudflare Workers 정적 에셋은 "요청 경로 = dist 안의 파일 경로" 라서
//   요청 /blog/assets/x.js  →  dist/blog/assets/x.js  (vite outDir 이 dist/blog)
// 그런데 SPA 폴백(not_found_handling)은 루트의 /index.html 만 돌려주고, _headers 도 루트에 있어야 읽힌다.
// 그래서 index.html 은 루트에 복사하고, public/ 에서 온 _headers 는 루트로 옮긴다.
import { copyFileSync, renameSync, existsSync } from "node:fs";

const root = new URL("../dist/", import.meta.url);
const sub = new URL("blog/", root);

copyFileSync(new URL("index.html", sub), new URL("index.html", root));
const h = new URL("_headers", sub);
if (existsSync(h)) renameSync(h, new URL("_headers", root));
console.log("postbuild: dist/index.html, dist/_headers 준비됨");
