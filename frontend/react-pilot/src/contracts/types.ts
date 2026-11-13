// 기존 complexes.json 에서 화면에 보여 주는 값만 읽기 전용으로 표현. 값이 없으면 null 로 명시하고 지어내지 않습니다.
import type { Grade } from "../tokens/tokens";

export interface ComplexView {
  readonly slug: string;
  readonly name: string;
  readonly region: string;       // 예: "대전 서구"
  readonly grade: Grade | null;  // 미산정이면 null
  readonly score: number | null; // 집감 지수. 미산정이면 null
  readonly recentTrade: { readonly priceMan: number; readonly area: number } | null; // 실거래. 없으면 null
  readonly estimated: { readonly priceMan: number; readonly area: number } | null;   // 추정(실거래와 따로)
}
