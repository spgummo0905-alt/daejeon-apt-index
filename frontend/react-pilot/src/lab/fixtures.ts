import type { ComplexView } from "../contracts/types";

// 시험 전용 가짜 단지. 운영에 나가지 않으며(비공개 파일럿 전용), 실제 단지로 오해되지 않게 이름에 "시험" 을 붙입니다.
export const FIXTURES: readonly ComplexView[] = [
  { slug: "fx-s", name: "시험단지 S", region: "시험 지역", grade: "S", score: 94, recentTrade: { priceMan: 38200, area: 84 }, estimated: { priceMan: 80500, area: 84 } },
  { slug: "fx-a", name: "시험단지 A", region: "시험 지역", grade: "A", score: 82, recentTrade: { priceMan: 52000, area: 59 }, estimated: null },
  { slug: "fx-n", name: "시험단지 미산정", region: "시험 지역", grade: null, score: null, recentTrade: null, estimated: null },
];
