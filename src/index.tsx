/*
 * fat-dissect — FatNotes 「解剖一切」插件
 *
 * 布局参考 fat-tools：
 *   - 活动栏图标      → 选中后显示主侧边栏 + 工作台整页
 *   - 主侧边栏（次面板）→ 只放解剖项目菜单（MenuView）
 *   - 工作台整页（右侧工作区）→ 按当前路由渲染对应视图（WorkPageView）
 *
 * 当前为初始化骨架，贡献点：
 *   - 活动栏 / 主侧边栏 / 工作台整页
 *   - 路由页注册（供宿主面包屑 / 全局导航识别）
 *   - 命令：fat-dissect.ping
 *   - 设置页
 */
import React from "react";
import type { Disposable, FatNotesPluginSDK } from "fat-notes-sdk";
import MenuView from "./MenuView";
import WorkPageView from "./WorkPageView";
import { HOME_PATH } from "./routes";

const disposables: Disposable[] = [];

/** 活动栏项 id —— 必须与工作台页 id 完全一致，宿主据此绑定右侧工作区 */
const ACTIVITY_ID = "fat-dissect.main";

/**
 * 逐项注册并吞掉单个贡献点的异常：
 * 某个宿主版本缺少某个 SDK 方法时，不能让它中断整个 activate()，
 * 否则后续贡献点与首屏 UI 都会一起消失（表现为"插件加载后啥都没有"）。
 */
function safeRegister(label: string, fn: () => Disposable | undefined | null): void {
  try {
    const d = fn();
    if (d) disposables.push(d);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[fat-dissect] 注册「${label}」失败：`, e);
  }
}

export async function activate(sdk: FatNotesPluginSDK): Promise<void> {
  // 1. 活动栏图标（点击后：左侧显示主侧边栏菜单 + 右侧显示工作台整页）
  //    不指定 primarySidebarViewId —— 宿主会用本插件的 primarySidebar 视图兜底。
  safeRegister("activityBar", () =>
    sdk.contributions.registerActivityBarItem({
      id: ACTIVITY_ID,
      title: "解剖 fat-dissect",
      icon: "Scissors",
      pluginName: "fat-dissect",
    }),
  );

  // 2. 主侧边栏（次面板）：展示解剖项目菜单
  safeRegister("primarySidebar", () =>
    sdk.contributions.registerPrimarySidebar(() => React.createElement(MenuView, { sdk })),
  );

  // 3. 工作台整页（右侧工作区）：id 与活动栏项一致，宿主才会在右侧渲染它
  safeRegister("workbenchPage", () =>
    sdk.contributions.registerWorkbenchPage({
      id: ACTIVITY_ID,
      render: () => React.createElement(WorkPageView, { sdk }),
    }),
  );

  // 4. 路由页注册（宿主用于面包屑 / 全局导航；实际渲染由工作台页按路由分发）
  safeRegister(`route:${HOME_PATH}`, () =>
    sdk.contributions.registerRoutePage({
      path: HOME_PATH,
      title: "欢迎",
      render: () => null,
    }),
  );

  // 5. 命令：ping
  safeRegister("command:ping", () =>
    sdk.commands.register("fat-dissect.ping", async () => {
      sdk.ui.toast.info(`[fat-dissect] pong（宿主 ${sdk.host.version}）`);
      return "pong";
    }),
  );

  // 6. 设置页
  safeRegister("settingsPage", () =>
    sdk.contributions.registerSettingsPage({
      id: "fat-dissect.settings",
      title: "fat-dissect 解剖",
      render: () =>
        React.createElement(
          "div",
          { style: { padding: 20, maxWidth: 560 } },
          React.createElement("h3", { style: { marginTop: 0 } }, "fat-dissect 解剖"),
          React.createElement(
            "p",
            null,
            "初始化骨架已就绪。左侧菜单选择项目，右侧工作区展示功能。",
          ),
          React.createElement(
            "p",
            { style: { color: "#888", fontSize: 12 } },
            "提示：可通过命令 fat-dissect.ping 验证插件是否正常工作。",
          ),
        ),
    }),
  );

  // 首次激活时确保路由有值（工作区直接可用）
  try {
    const path = sdk.router.getCurrent().path;
    if (!path) {
      sdk.router.navigate(HOME_PATH);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[fat-dissect] 初始化路由失败：", e);
  }
}

export function deactivate(): void {
  while (disposables.length) {
    try {
      disposables.pop()?.dispose();
    } catch (e) {
      // deactivate() 绝不能抛异常
      // eslint-disable-next-line no-console
      console.warn("[fat-dissect] dispose error", e);
    }
  }
}
