export type NoticeKind = "empty" | "saving" | "saved" | "failed";

const TEXT: Record<NoticeKind, string> = {
  empty: "아직 담은 단지가 없어요",
  saving: "계정에 보내는 중…",
  saved: "이 기기와 내 계정에 저장됐어요.",
  failed: "계정에는 보내지 못했어요. 이 기기에는 저장돼 있어요.",
};

/** 저장 상태 안내. 문구는 운영 화면(sync.js·field.js)과 같고, 실제 저장 결과를 받은 쪽(부모)이 kind 를 정합니다. 파일럿은 저장하지 않습니다. */
export function StateNotice({ kind }: { kind: NoticeKind }) {
  return (
    <p className={`jg-notice jg-notice--${kind}`} role={kind === "failed" ? "alert" : "status"}>
      {TEXT[kind]}
    </p>
  );
}
