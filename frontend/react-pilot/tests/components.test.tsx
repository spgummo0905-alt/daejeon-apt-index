import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GradeBadge } from "../src/components/GradeBadge";
import { MiniCard } from "../src/components/MiniCard";
import { StateNotice, type NoticeKind } from "../src/components/StateNotice";
import { FIXTURES } from "../src/lab/fixtures";
import { grade as gradeColors, GRADES } from "../src/tokens/tokens";

describe("GradeBadge", () => {
  it("shows the letter with an accessible label for every grade (never color only)", () => {
    for (const g of GRADES) {
      const { unmount } = render(<GradeBadge grade={g} />);
      expect(screen.getByLabelText(`${g} 등급`).textContent).toBe(g);
      unmount();
    }
  });
  it("shows 미산정 text for a missing grade instead of drawing one", () => {
    render(<GradeBadge grade={null} />);
    expect(screen.getByLabelText("등급 미산정").textContent).toBe("미산정");
  });
  it("keeps production grade colors: A is platinum (not gold), S is gold", () => {
    expect(gradeColors.S).toBe("#b8912f");
    expect(gradeColors.A).toBe("#8b95a7");
    expect(gradeColors.A).not.toBe(gradeColors.S);
  });
});

describe("MiniCard (read-only)", () => {
  it("shows real-trade and estimate separately", () => {
    render(<MiniCard c={FIXTURES[0]!} />);
    expect(screen.getByText(/실거래 3\.82억 · 84㎡/)).toBeTruthy();
    expect(screen.getByText(/추정 · 비교용 8\.05억 · 84㎡/)).toBeTruthy();
  });
  it("does not fabricate: missing trade/estimate/score are stated, not filled in", () => {
    render(<MiniCard c={FIXTURES[2]!} />);
    expect(screen.getByText(/지수 미산정/)).toBeTruthy();
    expect(screen.getByText("최근 실거래 자료 없음")).toBeTruthy();
    expect(screen.queryByText(/추정 · 비교용/)).toBeNull();
    expect(screen.getByLabelText("등급 미산정")).toBeTruthy();
  });
  it("has no buttons or links that could change user records", () => {
    const { container } = render(<>{FIXTURES.map(c => <MiniCard key={c.slug} c={c} />)}</>);
    expect(container.querySelectorAll("button, a, input, textarea, select").length).toBe(0);
  });
});

describe("StateNotice", () => {
  const cases: [NoticeKind, string][] = [
    ["empty", "아직 담은 단지가 없어요"],
    ["saving", "계정에 보내는 중…"],
    ["saved", "이 기기와 내 계정에 저장됐어요."],
    ["failed", "계정에는 보내지 못했어요. 이 기기에는 저장돼 있어요."],
  ];
  it.each(cases)("%s uses the same wording as production", (kind, text) => {
    render(<StateNotice kind={kind} />);
    expect(screen.getByText(text)).toBeTruthy();
  });
  it("failure is announced as an alert, others as status", () => {
    render(<StateNotice kind="failed" />);
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
