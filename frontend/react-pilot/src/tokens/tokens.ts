// 운영 사이트(static/style.css)와 같은 값. 새 색을 만들지 않고, 컴포넌트에서 임의 hex 를 쓰지 않습니다.
export const brand = {
  deep: "#0F3D33",
  cream: "#F7F4EC",
  dark: "#0B1F1A",
  action: "#13795b",
  mint: "#6fd1ae",
  muted: "#aeada3",
} as const;

// 등급 색: S 금, A 백금(금 아님), B 파랑, C 슬레이트, D 연한 회색
export const grade = {
  S: "#b8912f",
  A: "#8b95a7",
  B: "#2f6fb8",
  C: "#66738a",
  D: "#b9c0ca",
} as const;

export type Grade = keyof typeof grade;
export const GRADES = Object.keys(grade) as Grade[];
