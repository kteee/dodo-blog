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
  /** 블로그 그만두기 — 이 서비스 기록만 삭제. 실패하면 throw */
  onDeleteBlogData: () => Promise<void>;
  /** 두두 계정 탈퇴 — 계정과 모든 두두 서비스 기록 삭제. 실패하면 throw */
  onDeleteAccount: () => Promise<void>;
}

type Danger = "blog" | "account";

/**
 * 마이페이지: 내 정보 + 블로그 이름·소개 + 메뉴(데이터 내보내기, 개인정보 처리방침, 블로그 그만두기) + 두두 계정(탈퇴).
 * 두두 계정은 투두·북로그·블로그가 같이 쓰므로 "이 서비스만 그만두기"와 "계정 탈퇴"를 따로 둔다 (투두와 같은 구조)
 */
export function MyPage({ account, isLocal, profile, onProfile, onExport, onDeleteBlogData, onDeleteAccount }: Props) {
  const [confirming, setConfirming] = useState<Danger | null>(null);
  const [busy, setBusy] = useState<Danger | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const [title, setTitle] = useState(profile?.title ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");

  const run = async (what: Danger) => {
    setConfirming(null);
    setBusy(what);
    setError(null);
    try {
      if (what === "blog") {
        await onDeleteBlogData();
        setCleared(true);
        setBusy(null);
      } else {
        await onDeleteAccount();
        location.href = "/"; // 계정이 사라졌으니 처음 화면(로그인 안내)으로
      }
    } catch (e) {
      report(e, what === "blog" ? "deleteBlogData" : "deleteAccount");
      setBusy(null);
      setError(
        (what === "blog" ? "블로그를 삭제하지 못했습니다." : "탈퇴를 처리하지 못했습니다.") +
          " 잠시 후 다시 시도하거나 개인정보 처리방침의 연락처로 문의해 주세요.",
      );
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
          <div className="mypage-via">{isLocal ? "로컬 모드 (이 브라우저에만 저장)" : "Google 계정으로 로그인"}</div>
        </div>
      </section>

      {profile && onProfile && !cleared && (
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
          <button className="danger" onClick={() => setConfirming("blog")} disabled={busy !== null || cleared || !profile}>
            <span>
              <b>{busy === "blog" ? "삭제 중…" : cleared ? "블로그를 삭제했어요" : "블로그 그만두기"}</b>
              <small>
                {isLocal
                  ? "이 브라우저에 저장된 블로그와 글이 모두 지워져요"
                  : "글·이미지·블로그 주소가 즉시 삭제되며 되돌릴 수 없어요. 계정과 다른 두두 서비스는 그대로예요"}
              </small>
            </span>
            <i aria-hidden="true">›</i>
          </button>
        </li>
      </ul>

      {/* 두두 계정: 투두·북로그·블로그가 같이 쓰는 계정. 탈퇴는 전부 삭제라 블로그 메뉴와 떼어 둠 */}
      <h2 className="mypage-sub">두두 계정</h2>
      <ul className="mypage-menu">
        <li>
          <button className="danger" onClick={() => setConfirming("account")} disabled={busy !== null}>
            <span>
              <b>{busy === "account" ? "탈퇴 처리 중…" : "두두 계정 탈퇴"}</b>
              <small>{isLocal ? "이 브라우저에 저장된 기록이 모두 지워져요" : "투두·북로그·블로그 등 모든 두두 서비스의 기록과 계정이 즉시 삭제되며 되돌릴 수 없어요"}</small>
            </span>
            <i aria-hidden="true">›</i>
          </button>
        </li>
      </ul>
      {error && <p className="mypage-error">{error}</p>}

      {confirming === "blog" && (
        <ConfirmDialog
          title="블로그를 그만둘까요?"
          body={
            isLocal
              ? "이 브라우저에 저장된 블로그와 글이 모두 지워지며 복구할 수 없습니다."
              : `글과 이미지가 즉시 영구 삭제되고 주소 /${profile?.handle ?? ""} 도 비워져요. 복구할 수 없습니다. 두두 계정과 다른 서비스의 기록은 그대로 남습니다. 필요하면 먼저 데이터를 내보내 주세요.`
          }
          confirmLabel="삭제"
          onConfirm={() => run("blog")}
          onCancel={() => setConfirming(null)}
        />
      )}
      {confirming === "account" && (
        <ConfirmDialog
          title="정말 두두 계정을 탈퇴하시겠습니까?"
          body={
            isLocal
              ? "이 브라우저에 저장된 기록이 모두 지워지며 복구할 수 없습니다."
              : "계정과 투두·북로그·블로그 등 모든 두두 서비스의 데이터가 즉시 영구 삭제되며 복구할 수 없습니다. 필요하면 먼저 각 서비스에서 데이터를 내보내 주세요."
          }
          confirmLabel="탈퇴"
          onConfirm={() => run("account")}
          onCancel={() => setConfirming(null)}
        />
      )}
    </main>
  );
}
