import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Account } from "../data/auth";
import { usePhone } from "../hooks/usePhone";
import { onLinkClick } from "../hooks/useRoute";
import { app } from "../lib/paths";

interface Props {
  /** 공개 블로그 화면: 워드마크(DoDo·BLOG) 대신 그 블로그 제목. 누르면 블로그 홈 */
  brand?: { title: string; href: string; onClick?: () => void };
  /** 로고 오른쪽(본문 열)에 들어갈 검색창 (블로그 화면에서만) */
  search?: ReactNode;
  account: Account | null;
  isLocal: boolean;
  /** 로그인했고 블로그를 만들었으면 그 주소 (/<아이디>) */
  myBlog: string | null;
  menuOpen: boolean;
  setMenuOpen: (o: boolean) => void;
  onSignIn: () => void;
  onSignOut: () => void;
}

function Avatar({ a }: { a: Account }) {
  return <span className="avatar">{a.picture ? <img src={a.picture} alt="" referrerPolicy="no-referrer" /> : a.initial}</span>;
}

/**
 * Google 로그인 버튼 — Google 브랜드 가이드(Sign in with Google) 준수 (투두와 같음):
 * 공식 4색 G 로고, 흰 배경 + #747775 테두리 + #1F1F1F 글자, 공식 한국어 문구 "Google 계정으로 로그인".
 */
export function GoogleButton({ onClick, size = "md" }: { onClick: () => void; size?: "sm" | "md" }) {
  return (
    <button className={"gsi-btn gsi-" + size} onClick={onClick}>
      <svg className="gsi-logo" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
      <span className="gsi-text">Google 계정으로 로그인</span>
    </button>
  );
}

/** 헤더 — 투두 TopNav 와 같은 구조: 왼쪽 열(로고) | 오른쪽 열(프로필). 남의 블로그를 보는 손님에겐 작은 로그인 버튼 */
export function TopNav({ brand, search, account, isLocal, myBlog, menuOpen, setMenuOpen, onSignIn, onSignOut }: Props) {
  // 폰: 검색창 대신 돋보기 버튼(프로필 왼쪽). 누르면 아래 줄에 검색창이 열리고 바로 입력 가능 (북로그와 같음)
  const phone = usePhone();
  const [searchOpen, setSearchOpen] = useState(false);
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!searchOpen) return;
    row.current?.querySelector("input")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSearchOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [searchOpen]);
  const searchSlot = !search ? null : !phone ? (
    search
  ) : (
    <>
      {searchOpen && (
        <div
          ref={row}
          className="search-row"
          onBlur={(e) => {
            const input = row.current?.querySelector("input");
            if (!row.current?.contains(e.relatedTarget as Node) && !input?.value) setSearchOpen(false);
          }}
        >
          {search}
          <button className="search-close" onClick={() => setSearchOpen(false)}>
            취소
          </button>
        </div>
      )}
      <button className="search-btn" aria-label="글 검색" aria-expanded={searchOpen} onClick={() => setSearchOpen((o) => !o)}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5L14 14" />
        </svg>
      </button>
    </>
  );
  return (
    <header className="topnav">
      <a
        className="logo"
        href={brand ? brand.href : app()}
        onClick={(e) => {
          onLinkClick(e);
          if (!e.defaultPrevented) return;
          brand?.onClick?.(); // 블로그 제목 = 전체 보기 (필터 초기화)
        }}
      >
        {brand ? (
          // 공개 블로그: 로고 마크 없이 블로그 제목만
          <span className="word btitle" title={brand.title}>
            {brand.title}
          </span>
        ) : (
          <>
            <span className="mark" aria-hidden="true">
              {/* 탭 아이콘(favicon.svg)과 같은 좌표·비율: 네모를 꽉 채운 24 기준 (연필 + 밑줄) */}
              <svg viewBox="0 0 24 24">
                <path d="M7 17.2h10M7.6 13.6l6.9-6.9a1.4 1.4 0 0 1 2 2l-6.9 6.9-2.9.9z" />
              </svg>
            </span>
            <span className="word">DoDo</span>
            <span className="tag">blog</span>
          </>
        )}
      </a>
      <div className="topnav-main">
        {searchSlot}
        <div className="acct">
          {!account ? (
            !isLocal && <GoogleButton size="sm" onClick={onSignIn} />
          ) : (
            <>
              <button className="acctbtn" aria-expanded={menuOpen} aria-label={account.name + " 계정 메뉴"} onClick={() => setMenuOpen(!menuOpen)}>
                <Avatar a={account} />
                <span className="who">{account.name}</span>
                <span className="caret" aria-hidden="true">
                  ▾
                </span>
              </button>
              {menuOpen && (
                <div className="acctmenu">
                  <div className="me">
                    <Avatar a={account} />
                    <span className="txt2">
                      <div className="nm2">{account.name}</div>
                      <div className="em">{account.email}</div>
                    </span>
                  </div>
                  {isLocal && <div className="note">Supabase를 연결하면 구글 로그인과 기기 간 동기화가 켜져요.</div>}
                  <div className="rule" />
                  {myBlog && (
                    <a
                      className="mi"
                      href={myBlog}
                      onClick={(e) => {
                        setMenuOpen(false);
                        onLinkClick(e);
                      }}
                    >
                      내 블로그
                    </a>
                  )}
                  {myBlog && (
                    <a
                      className="mi"
                      href={app("/categories")}
                      onClick={(e) => {
                        setMenuOpen(false);
                        onLinkClick(e);
                      }}
                    >
                      카테고리 관리
                    </a>
                  )}
                  <a
                    className="mi"
                    href={app("/my")}
                    onClick={(e) => {
                      setMenuOpen(false);
                      onLinkClick(e);
                    }}
                  >
                    마이페이지
                  </a>
                  {!isLocal && (
                    <button
                      className="mi out"
                      onClick={() => {
                        setMenuOpen(false);
                        onSignOut();
                      }}
                    >
                      로그아웃
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
