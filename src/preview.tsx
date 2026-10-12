/*
 * preview.tsx — 独立预览入口（不经过 Module Federation 宿主）。
 *
 * 用途：在浏览器里直接打开 dist-preview/index.html 即可查看
 *       fat-dissect 各工具的独立渲染效果（当前为坦克 3D 解构）。
 * 构建：npm run build:preview
 */
import React from "react";
import { createRoot } from "react-dom/client";
import TankView from "./tools/TankView";

const root = createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <TankView />
  </React.StrictMode>,
);
