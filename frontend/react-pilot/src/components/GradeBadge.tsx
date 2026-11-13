import { grade as colors, type Grade } from "../tokens/tokens";

/** 등급 배지. 색만으로 전달하지 않고 글자(S~D)를 항상 함께 보여 줍니다. 값이 없으면 "미산정". */
export function GradeBadge({ grade }: { grade: Grade | null }) {
  if (grade === null) {
    return <span className="jg-grade jg-grade--none" aria-label="등급 미산정">미산정</span>;
  }
  return (
    <span className="jg-grade" style={{ background: colors[grade] }} aria-label={`${grade} 등급`}>
      {grade}
    </span>
  );
}
