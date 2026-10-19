/*
 * WorkPageView：工作台整页（右侧工作区）—— 按当前路由渲染对应视图。
 *
 * 已接入的解剖工具：
 *   - /dissect/home → 欢迎页
 *   - /dissect/tank → 坦克 3D 解构（three.js 模型 + 分解动画 + 运行原理演示）
 *   - /dissect/palace → 故宫太和殿 3D 解构（three.js 模型 + 分解动画 + 建筑结构解析）
 */
import React, { useEffect, useReducer } from "react";
import { Card, Descriptions, Empty } from "antd";
import type { FatNotesPluginSDK } from "fat-notes-sdk";
import TankView from "./tools/TankView";
import PalaceView from "./tools/PalaceView";
import { HOME_PATH, TANK_PATH, PALACE_PATH, isDissectRoute } from "./routes";

interface Props {
  sdk: FatNotesPluginSDK;
}

const WorkPageView: React.FC<Props> = ({ sdk }) => {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  // 订阅路由变化：切换右侧工作区内容
  useEffect(() => {
    const d = sdk.router.onChange(() => forceUpdate());
    return () => d.dispose();
  }, [sdk]);

  const path = sdk.router.getCurrent().path;

  if (!isDissectRoute(path)) {
    return (
      <div style={{ padding: 24 }}>
        <Empty description={`当前路由：${path || "(空)"}`} />
      </div>
    );
  }

  if (path === TANK_PATH) {
    return <TankView />;
  }

  if (path === PALACE_PATH) {
    return <PalaceView />;
  }

  return (
    <div style={{ padding: 24 }}>
      <Card title="fat-dissect — Dissect everything">
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="插件">fat-dissect v0.1.0</Descriptions.Item>
          <Descriptions.Item label="宿主版本">
            {sdk.host.version}
          </Descriptions.Item>
          <Descriptions.Item label="当前路由">
            {path || HOME_PATH}
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            骨架已就绪，等待填充解剖工具。
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
};

export default WorkPageView;
