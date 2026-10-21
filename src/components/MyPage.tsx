import { useState } from "react";
import type { Account } from "../data/auth";
import type { Profile } from "../lib/types";
import { LIMITS } from "../lib/types";
import { report } from "../lib/monitoring";
import { onLinkClick } from "../hooks/useRoute";
import { ConfirmDialog } from "./ConfirmDialog";

interface Props {
  account: Account;
  isLocal: boolean;
  profile: Profile | null;
  onProfile: ((patch: Partial<Pick<Profile, "title" | "bio">>) => void) | null;
  onExport: (() => void) | null;
  /** 회원 탈퇴 — 실패하면 throw */
  onDeleteAccount: () => Promise<void>;
}

/** 마이페이지: 내 정보 + 블로그 이름·소개 + 메뉴(데이터 내보내기, 개인정보 처리방침, 회원 탈퇴) */
export function MyPage({ account, isLocal, profile, onProfile, onExport, onDeleteAccount }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(profile?.title ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");

  const withdraw = async () => {
    setConfirming(false);
    setBusy(true);
    setError(null);
    try {
      await onDeleteAccount();
      location.href = "/"; // 계정이 사라졌으니 처음 화면(로그인 안내)으로
    } catch (e) {
      report(e, "deleteAccount");
      setBusy(false);
      setError("탈퇴를 처리하지 못했습니다. 잠시 후 다시 시도하거나 개인정보 처리방침의 연락처로 문의해 주세요.");
    }
  };
  const saveProfile = () => {
    if (!onProfile || !profile) return;
    onProfile({ title: title.trim() || profile.title, bio: bio.trim() });
    if (!title.trim()) setTitle(profile.title);
  };

  return (
    <main className="mypage">
      <a className="mypage-back" href={profile ? "/" + profile.handle : "/"} onClick={onLinkClick}>
        ← 블로그로 돌아가기
      </a>
      <h1>마이페이지</h1>

      <section className="mypage-profile">
        <span className="avatar avatar-lg">{account.picture ? <img src={account.picture} alt="" referrerPolicy="no-referrer" /> : account.initial}</span>
        <div className="mypage-who">
          <div className="mypage-name">{account.name}</div>
          <div className="mypage-email">{account.email}</div>
          <div className="mypage-via">{isLocal ? "로컬 모드 (이 브라우저에만 저장)" : "Google 계정으로 로그인 · 두두 투두·북로그와 같은 계정"}</div>
        </div>
      </section>

      {profile && onProfile && (
        <section className="mypage-blog">
          <p className="sect-label">내 블로그</p>
          <div className="mk-row">
            <span className="mk-pre">주소</span>
            <span className="mk-val">blog.dododiary.com/{profile.handle}</span>
          </div>
          <label className="mk-row">
            <span className="mk-pre">이름</span>
            <input className="mk-in" type="text" value={title} maxLength={LIMITS.blogTitle} onChange={(e) => setTitle(e.target.value)} onBlur={saveProfile} />
          </label>
          <label className="mk-row top">
            <span className="mk-pre">소개</span>
            <textarea className="mk-in" rows={2} value={bio} maxLength={LIMITS.bio} placeholder="한두 줄 소개 (선택)" onChange={(e) => setBio(e.target.value)} onBlur={saveProfile} />
          </label>
        </section>
      )}

      <ul className="mypage-menu">
        {onExport && (
          <li>
            <button onClick={onExport}>
              <span>
                <b>데이터 내보내기</b>
                <small>블로그 정보와 모든 글(임시글 포함)을 JSON 파일로 내려받아요</small>
              </span>
              <i aria-hidden="true">›</i>
            </button>
          </li>
        )}
        <li>
          <a href="/privacy">
            <span>
              <b>개인정보 처리방침</b>
            </span>
            <i aria-hidden="true">›</i>
          </a>
        </li>
        <li>
          <button className="danger" onClick={() => setConfirming(true)} disabled={busy}>
            <span>
              <b>{busy ? "탈퇴 처리 중…" : "회원 탈퇴"}</b>
              <small>
                {isLocal
                  ? "이 브라우저에 저장된 글이 모두 지워져요"
                  : "두두 계정 자체가 삭제돼요 — 블로그뿐 아니라 두두 투두·북로그의 기록도 함께 즉시 삭제되며 되돌릴 수 없어요"}
              </small>
            </span>
            <i aria-hidden="true">›</i>
          </button>
        </li>
      </ul>
      {error && <p className="mypage-error">{error}</p>}

      {confirming && (
        <ConfirmDialog
          title="정말 탈퇴하시겠습니까?"
          body={
            isLocal
              ? "이 브라우저에 저장된 블로그와 글이 모두 지워지며 복구할 수 없습니다."
              : "두두 계정이 삭제됩니다. 블로그의 글·이미지와 함께 두두 투두의 할 일·메모, 북로그의 책·노트까지 즉시 영구 삭제되며 복구할 수 없습니다. 필요하면 각 서비스에서 먼저 데이터를 내보내 주세요."
          }
          confirmLabel="탈퇴"
          onConfirm={withdraw}
          onCancel={() => setConfirming(false)}
        />
      )}
    </main>
  );
}
