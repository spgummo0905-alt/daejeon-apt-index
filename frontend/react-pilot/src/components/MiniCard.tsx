import type { ComplexView } from "../contracts/types";
import { GradeBadge } from "./GradeBadge";

const eok = (man: number) => (man >= 10000 ? `${+(man / 10000).toFixed(2)}억` : `${Math.round(man).toLocaleString("ko-KR")}만`);

/** 읽기 전용 미니 카드. 저장·즐겨찾기·임장 기록을 바꾸는 버튼이 없습니다(파일럿 규칙: 쓰기 금지). 실거래와 추정은 따로 표시. */
export function MiniCard({ c }: { c: ComplexView }) {
  return (
    <article className="jg-card" aria-label={`${c.name} 미니 카드`}>
      <GradeBadge grade={c.grade} />
      <h3>{c.name}</h3>
      <p className="jg-sub">{c.region}{c.score === null ? " · 지수 미산정" : ` · 집감 지수 ${c.score}`}</p>
      <p>{c.recentTrade ? `실거래 ${eok(c.recentTrade.priceMan)} · ${c.recentTrade.area}㎡` : "최근 실거래 자료 없음"}</p>
      {c.estimated ? <p className="jg-est">추정 · 비교용 {eok(c.estimated.priceMan)} · {c.estimated.area}㎡</p> : null}
    </article>
  );
}
