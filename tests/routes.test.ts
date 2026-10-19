import { describe, expect, it } from "vitest";
import {
  HOME_PATH,
  PALACE_PATH,
  ROUTE_PREFIX,
  TANK_PATH,
  isDissectRoute,
} from "../src/routes";

describe("fat-dissect routes", () => {
  it("ROUTE_PREFIX 挂在 /dissect 命名空间下", () => {
    expect(ROUTE_PREFIX).toBe("/dissect");
  });

  it("HOME_PATH 位于前缀之下", () => {
    expect(HOME_PATH).toBe(`${ROUTE_PREFIX}/home`);
    expect(HOME_PATH.startsWith(ROUTE_PREFIX)).toBe(true);
  });

  it("TANK_PATH 位于前缀之下", () => {
    expect(TANK_PATH).toBe(`${ROUTE_PREFIX}/tank`);
    expect(TANK_PATH.startsWith(ROUTE_PREFIX)).toBe(true);
  });

  it("PALACE_PATH 位于前缀之下", () => {
    expect(PALACE_PATH).toBe(`${ROUTE_PREFIX}/palace`);
    expect(PALACE_PATH.startsWith(ROUTE_PREFIX)).toBe(true);
  });

  it("isDissectRoute 识别本插件路由", () => {
    expect(isDissectRoute(ROUTE_PREFIX)).toBe(true);
    expect(isDissectRoute(HOME_PATH)).toBe(true);
    expect(isDissectRoute(`${ROUTE_PREFIX}/anything/else`)).toBe(true);
  });

  it("isDissectRoute 拒绝其它插件路由", () => {
    expect(isDissectRoute("/tools/calculator")).toBe(false);
    expect(isDissectRoute("/dissector")).toBe(false);
    expect(isDissectRoute("")).toBe(false);
  });
});
