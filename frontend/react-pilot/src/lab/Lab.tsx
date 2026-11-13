import { FIXTURES } from "./fixtures";
import { MiniCard } from "../components/MiniCard";
import { StateNotice } from "../components/StateNotice";

/** 비공개 시험 화면. 가짜 시험 자료로만 그리며, 이 폴더의 코드는 저장소(localStorage·서버)를 읽지도 쓰지도 않습니다. */
export function Lab() {
  return (
    <main className="jg-lab">
      <h1>React 파일럿 · 컴포넌트 랩</h1>
      <p>시험용 가짜 자료입니다. 운영 화면이 아닙니다.</p>
      {FIXTURES.map(c => <MiniCard key={c.slug} c={c} />)}
      <StateNotice kind="empty" />
      <StateNotice kind="saving" />
      <StateNotice kind="saved" />
      <StateNotice kind="failed" />
    </main>
  );
}
