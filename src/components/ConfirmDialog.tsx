import { useEffect, useRef } from "react";

interface Props {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 확인 팝업 (투두와 같은 모양). 기본 포커스는 취소 */
export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => cancelRef.current?.focus(), []);
  return (
    <div
      className="modal-back"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.nativeEvent.stopPropagation();
        onCancel();
      }}
    >
      <div className="modal" role="alertdialog" aria-modal="true" aria-label={title}>
        <h4>{title}</h4>
        <p>{body}</p>
        <div className="acts">
          <button ref={cancelRef} className="cancel" onClick={onCancel}>
            취소
          </button>
          <button className="danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
