/*
 * MenuView：主侧边栏（次面板）—— 解剖项目菜单
 *
 * 点击菜单项 → sdk.router.navigate(path)，
 * 真正的界面由工作台页 WorkPageView 在右侧工作区渲染。
 */
import React, { useEffect, useReducer } from "react";
import { Menu } from "antd";
import type { FatNotesPluginSDK } from "fat-notes-sdk";
import { HOME_PATH } from "./routes";

interface Props {
  sdk: FatNotesPluginSDK;
}

const MenuView: React.FC<Props> = ({ sdk }) => {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  // 订阅路由变化：菜单高亮跟随右侧工作区当前页
  useEffect(() => {
    const d = sdk.router.onChange(() => forceUpdate());
    return () => d.dispose();
  }, [sdk]);

  const currentPath = sdk.router.getCurrent().path;

  return (
    <Menu
      mode="inline"
      selectedKeys={[currentPath]}
      items={[
        {
          key: HOME_PATH,
          label: "欢迎",
        },
      ]}
      onClick={({ key }) => sdk.router.navigate(key)}
    />
  );
};

export default MenuView;
