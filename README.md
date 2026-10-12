# fat-dissect

Dissect everything — FatNotes 插件：解剖一切。

## 功能

- `/dissect/tank` — 坦克 3D 解构：程序化 three.js 模型，三种演示模式
  - 整体视图：完整装配，可旋转观察外形
  - 结构分解：各子系统（车体/履带/负重轮/主动轮/诱导轮/扭杆悬挂/炮塔/弹药架/发动机/变速箱/油箱/驾驶舱/散热排气）平滑"爆炸"分离，带中英双语标注
  - 运行原理：半分解 + 动力传递链演示（发动机→变速箱→主动轮→履带），履带滚动、负重轮转动、能量光点沿动力链循环，分阶段高亮讲解

## 开发

```bash
npm run typecheck   # 类型检查
npm test            # 单测
npm run build       # 插件产物（Module Federation remote）
npm run build:preview   # 独立预览构建 → dist-preview/index.html
```

独立预览（不依赖宿主）：

```bash
npm run build:preview
# 浏览器直接打开 dist-preview/index.html
# 或：python -m http.server -d dist-preview <port>
```
