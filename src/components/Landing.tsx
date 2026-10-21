import { useEffect, useRef, useState } from "react";
import { GoogleButton } from "./TopNav";
import { LIMITS, handleProblem } from "../lib/types";
import { describeError, report } from "../lib/monitoring";

/** 로그인 전 첫 화면: 서비스 한 줄 소개 + 로그인 */
export function Intro({ onSignIn }: { onSignIn: () => void }) {
  return (
    <main className="signed-out intro">
      <h1 className="intro-h">마크다운으로 쓰는 나만의 블로그</h1>
      <p>다이어리에 적듯이, 간편하게. 내 주소는 blog.dododiary.com/아이디</p>
      <GoogleButton onClick={onSignIn} />
    </main>
  );
}

interface CreateProps {
  /** 아이디가 쓰이고 있는지 (서버 확인) */
  taken: (handle: string) => Promise<boolean>;
  /** 만들기. 실패하면 throw */
  onCreate: (handle: string, title: string) => Promise<void>;
}

/** 로그인은 했지만 아직 블로그가 없을 때: 아이디(주소)와 블로그 이름 정하기 */
export function CreateBlog({ taken, onCreate }: CreateProps) {
  const [handle, setHandle] = useState("");
  const [title, setTitle] = useState("");
  const [hint, setHint] = useState<{ kind: "err" | "ok" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  // 아이디 칸: 치는 대로 규칙 검사, 0.4초 멈추면 중복 확인
  useEffect(() => {
    const h = handle;
    if (!h) {
      setHint(null);
      return;
    }
    const problem = handleProblem(h);
    if (problem) {
      setHint({ kind: "err", text: problem });
      return;
    }
    setHint({ kind: "info", text: "확인 중…" });
    const my = ++seq.current;
    const t = window.setTimeout(async () => {
      try {
        const used = await taken(h);
        if (my !== seq.current) return;
        setHint(used ? { kind: "err", text: "이미 쓰고 있는 아이디예요" } : { kind: "ok", text: `blog.dododiary.com/${h} — 쓸 수 있어요` });
      } catch (e) {
        if (my !== seq.current) return;
        report(e, "handleTaken");
        setHint({ kind: "err", text: "확인하지 못했어요. 연결을 확인해 주세요" });
      }
    }, 400);
    return () => clearTimeout(t);
  }, [handle, taken]);

  const canSubmit = !busy && hint?.kind === "ok";
  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await onCreate(handle, title.trim() || handle);
    } catch (e) {
      report(e, "createProfile");
      const d = describeError(e);
      setHint({ kind: "err", text: /23505|duplicate|unique/i.test(d) ? "방금 누군가 그 아이디를 가져갔어요. 다른 아이디를 골라주세요" : "만들지 못했어요. 잠시 후 다시 시도해 주세요" });
      setBusy(false);
    }
  };

  return (
    <main className="signed-out intro">
      <h1 className="intro-h">블로그 주소를 정해주세요</h1>
      <p>한 번 정하면 바꿀 수 없어요. 영문 소문자·숫자·하이픈 3~20자</p>
      <form
        className="mkblog"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="mk-row">
          <span className="mk-pre">blog.dododiary.com/</span>
          <input
            className="mk-in"
            type="text"
            value={handle}
            maxLength={LIMITS.handleMax}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            placeholder="아이디"
            onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
          />
        </label>
        <p className={"mk-hint" + (hint ? " " + hint.kind : "")}>{hint?.text ?? " "}</p>
        <label className="mk-row">
          <span className="mk-pre">블로그 이름</span>
          <input className="mk-in" type="text" value={title} maxLength={LIMITS.blogTitle} placeholder={handle ? `${handle}의 블로그` : "나중에 바꿀 수 있어요"} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <button type="submit" className="btn primary mk-go" disabled={!canSubmit}>
          {busy ? "만드는 중…" : "블로그 만들기"}
        </button>
      </form>
    </main>
  );
}
