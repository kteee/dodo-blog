/**
 * 사이트 푸터 — 글 목록·글 보기·에디터엔 없음. 로그인 전 화면·마이페이지·개인정보 처리방침에만. (투두와 같은 모양)
 * 왼쪽: 두두 서비스 링크, 오른쪽: 처리방침·문의. 폰에선 두 줄 가운데 정렬
 */
import { app } from "../lib/paths";

const CONTACT = "kte02320@gmail.com";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <nav className="sf-family" aria-label="두두 서비스">
        <span className="sf-copy">© 두두다이어리</span>
        <a href="https://dododiary.com">두두 홈</a>
        <span className="sf-dot" aria-hidden="true">·</span>
        <a href="https://todo.dododiary.com">투두리스트</a>
        <span className="sf-dot" aria-hidden="true">·</span>
        <a href="https://books.dododiary.com">북로그</a>
        <span className="sf-dot" aria-hidden="true">·</span>
        <a href={app()} aria-current="page" className="sf-now">
          블로그
        </a>
      </nav>
      <nav className="sf-info" aria-label="안내">
        <a href={app("/privacy")}>개인정보 처리방침</a>
        <span className="sf-dot" aria-hidden="true">·</span>
        <a href={"mailto:" + CONTACT}>문의</a>
      </nav>
    </footer>
  );
}
