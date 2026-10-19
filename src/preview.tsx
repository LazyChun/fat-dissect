/*
 * preview.tsx — 独立预览入口（不经过 Module Federation 宿主）。
 *
 * 用途：在浏览器里直接打开 dist-preview/index.html 即可查看
 *       fat-dissect 各工具的独立渲染效果（坦克 3D 解构 / 故宫太和殿 3D 解构）。
 * 构建：npm run build:preview
 * 切换：顶部按钮，或 URL hash（#tank / #palace）
 */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import TankView from "./tools/TankView";
import PalaceView from "./tools/PalaceView";

type Which = "tank" | "palace";

function readHash(): Which {
  return window.location.hash === "#palace" ? "palace" : "tank";
}

const PreviewApp: React.FC = () => {
  const [which, setWhich] = useState<Which>(readHash());

  const pick = (w: Which) => {
    setWhich(w);
    window.location.hash = w;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div style={{ display: "flex", gap: 8, padding: "8px 12px", background: "#0f1115" }}>
        {(["tank", "palace"] as Which[]).map((w) => (
          <button
            key={w}
            onClick={() => pick(w)}
            style={{
              padding: "4px 14px",
              borderRadius: 6,
              cursor: "pointer",
              border: `1px solid ${which === w ? "#d4af37" : "#3a3f48"}`,
              background: which === w ? "#2a2519" : "#171a1f",
              color: which === w ? "#e0c56a" : "#9aa0ab",
            }}
          >
            {w === "tank" ? "坦克 3D 解构" : "故宫太和殿 3D 解构"}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {which === "tank" ? <TankView /> : <PalaceView />}
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <PreviewApp />
  </React.StrictMode>,
);
