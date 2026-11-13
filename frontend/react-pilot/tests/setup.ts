import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// 시험마다 그려진 화면을 비워 서로 영향이 없게 함
afterEach(() => cleanup());
