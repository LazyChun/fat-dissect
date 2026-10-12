/*
 * TankView — 坦克 3D 模型 + 解构动画 + 运行原理演示
 *
 * 全部模型用 three.js 基础几何体程序化搭建（无需外部模型文件）：
 *   - 倾斜装甲（楔形首上/首下）、多面体炮塔、分段炮管（热护套/抽烟装置/制退器）
 *   - 履带 / 负重轮（轮缘+轮毂）/ 主动轮（齿+轮辐）/ 诱导轮 / 托带轮 / 扭杆悬挂
 *   - 发动机（气缸组）/ 变速箱 / 油箱 / 弹药架 / 驾驶舱 / 散热排气
 *   - 车体附件：侧裙板、挡泥板、工具箱、油桶、天线、机枪、散热格栅
 *
 * 三种模式：
 *   - 整体视图：完整装配，可自由旋转观察外形
 *   - 结构分解：各子系统沿解构方向平滑"爆炸"分离，配合标注看清内部结构
 *   - 运行原理：半分解 + 动力传递演示（发动机→变速箱→主动轮→履带），
 *               履带滚动、负重轮转动、能量光点沿动力链循环，分阶段高亮讲解
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  Divider,
  Radio,
  Slider,
  Space,
  Switch,
  Tag,
  Typography,
} from "antd";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

type Mode = "assemble" | "explode" | "run";

interface PartDef {
  id: string;
  name: string;
  color: string;
  accent: string; // 运行演示时的高亮色
  group: THREE.Group;
  base: THREE.Vector3;
  dir: THREE.Vector3;
  amount: number;
  labelOffsetY: number;
  mats: THREE.MeshStandardMaterial[];
}

interface TankScene {
  setExplode: (v: number) => void;
  setRunning: (v: boolean) => void;
  setSpeed: (v: number) => void;
  setShowLabels: (v: boolean) => void;
  setAutoRotate: (v: boolean) => void;
  resetView: () => void;
  onStage?: (stage: number) => void;
  dispose: () => void;
}

/* ---------------------------------- 基础工具 ---------------------------------- */

function std(
  color: number,
  opts?: Partial<THREE.MeshStandardMaterialParameters>,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.85,
    metalness: 0.2,
    ...opts,
  });
}

/** 机械件常用：平面着色，突出棱角 */
function flat(color: number, opts?: Partial<THREE.MeshStandardMaterialParameters>): THREE.MeshStandardMaterial {
  return std(color, { flatShading: true, ...opts });
}

/** 向 parent 添加一个网格并设置位置 / 旋转 */
function addMesh(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  pos: [number, number, number] = [0, 0, 0],
  rot: [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(pos[0], pos[1], pos[2]);
  m.rotation.set(rot[0], rot[1], rot[2]);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/**
 * 斜六面体（楔形装甲板）：底部矩形，顶部矩形沿 Z 平移 topShift。
 * 用于首上/首下大倾角装甲、炮塔前楔等 —— 是"像坦克"的关键。
 */
function makeSlopedBox(w: number, h: number, d: number, topShift: number): THREE.BufferGeometry {
  const hw = w / 2;
  const hd = d / 2;
  const pos = new Float32Array([
    // 0-3 底部
    -hw, 0, -hd,  hw, 0, -hd,  hw, 0, hd,  -hw, 0, hd,
    // 4-7 顶部
    -hw, h, -hd + topShift,  hw, h, -hd + topShift,  hw, h, hd + topShift,  -hw, h, hd + topShift,
  ]);
  const idx = [
    // 底面
    0, 2, 1,  0, 3, 2,
    // 顶面
    4, 5, 6,  4, 6, 7,
    // 前面 (z=+d)
    3, 2, 6,  3, 6, 7,
    // 后面 (z=-d)
    1, 0, 4,  1, 4, 5,
    // 左面 (x=-w)
    0, 3, 7,  0, 7, 4,
    // 右面 (x=+w)
    2, 1, 5,  2, 5, 6,
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** 履带纹理：横向棱纹，运行时整体滚动 */
function makeTreadTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#1f2125";
  ctx.fillRect(0, 0, 256, 64);
  // 履带板
  for (let i = 0; i < 52; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#2e3136" : "#1a1c20";
    ctx.fillRect(i * 5, 0, 4, 64);
  }
  // 诱导齿（中间凸脊）
  ctx.fillStyle = "#3a3e44";
  for (let i = 0; i < 26; i++) {
    ctx.fillRect(i * 10, 24, 4, 16);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 1);
  tex.anisotropy = 8;
  return tex;
}

/** 负重轮 / 诱导轮：橡胶外圈 + 金属轮辋 + 轮毂盖 */
function makeWheel(
  radius: number,
  width: number,
  color: number,
  rimColor: number,
): THREE.Mesh {
  const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 22);
  tireGeo.rotateZ(Math.PI / 2); // 轴 → X
  const m = new THREE.Mesh(tireGeo, std(color, { roughness: 0.95, metalness: 0.15 }));
  m.castShadow = true;
  // 金属轮辋（比橡胶略宽，形成外露环）
  const rimGeo = new THREE.CylinderGeometry(radius * 0.93, radius * 0.93, width + 0.05, 22);
  rimGeo.rotateZ(Math.PI / 2);
  const rim = new THREE.Mesh(rimGeo, std(rimColor, { roughness: 0.45, metalness: 0.75 }));
  rim.castShadow = true;
  m.add(rim);
  // 轮毂盖
  const hubGeo = new THREE.CylinderGeometry(radius * 0.3, radius * 0.3, width + 0.06, 12);
  hubGeo.rotateZ(Math.PI / 2);
  const hub = new THREE.Mesh(hubGeo, std(rimColor, { roughness: 0.5, metalness: 0.8 }));
  hub.castShadow = true;
  m.add(hub);
  // 轮缘（两侧薄盘，强化负重轮观感）
  for (const sx of [-1, 1]) {
    const discGeo = new THREE.CylinderGeometry(radius * 0.78, radius * 0.78, 0.03, 18);
    discGeo.rotateZ(Math.PI / 2);
    const disc = new THREE.Mesh(discGeo, std(rimColor, { roughness: 0.5, metalness: 0.7 }));
    disc.position.x = sx * width * 0.32;
    disc.castShadow = true;
    m.add(disc);
  }
  return m;
}

/** 主动轮：齿 + 轮辐盘 + 轮毂 */
function makeSprocket(
  radius: number,
  width: number,
  color: number,
  teeth: number,
): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(radius, radius, width, 18);
  geo.rotateZ(Math.PI / 2);
  const m = new THREE.Mesh(geo, std(color, { roughness: 0.85, metalness: 0.4 }));
  m.castShadow = true;
  // 轮齿
  const toothGeo = new THREE.BoxGeometry(0.11, 0.17, 0.22);
  const toothMat = std(0x17191c, { roughness: 0.95, metalness: 0.35 });
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const t = new THREE.Mesh(toothGeo, toothMat);
    t.position.set(0, Math.sin(a) * (radius + 0.04), Math.cos(a) * (radius + 0.04));
    t.rotation.x = Math.PI / 2 - a;
    t.castShadow = true;
    m.add(t);
  }
  // 轮辐盘（齿内侧的金属圆盘，形成履带轮典型观感）
  const discGeo = new THREE.CylinderGeometry(radius * 0.5, radius * 0.5, width + 0.06, 12);
  discGeo.rotateZ(Math.PI / 2);
  const disc = new THREE.Mesh(discGeo, std(0x23262b, { roughness: 0.5, metalness: 0.75 }));
  disc.castShadow = true;
  m.add(disc);
  // 轮毂
  const hubGeo = new THREE.CylinderGeometry(radius * 0.26, radius * 0.26, width + 0.08, 10);
  hubGeo.rotateZ(Math.PI / 2);
  const hub = new THREE.Mesh(hubGeo, std(0x23262b, { roughness: 0.45, metalness: 0.8 }));
  hub.castShadow = true;
  m.add(hub);
  return m;
}

/** 创建带 CSS2D 标签的分组 */
function makePart(
  name: string,
  color: string,
  accent: string,
  base: [number, number, number],
  dir: [number, number, number],
  amount: number,
  labelOffsetY: number,
): { part: PartDef; label: CSS2DObject } {
  const group = new THREE.Group();
  group.position.set(base[0], base[1], base[2]);
  const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();

  const div = document.createElement("div");
  div.textContent = name;
  div.style.cssText = [
    "position:absolute",
    "background:rgba(16,18,24,0.88)",
    "color:#e8ebf0",
    "border:1px solid " + color,
    "border-radius:10px",
    "padding:2px 9px",
    "font-size:12px",
    "line-height:16px",
    "white-space:nowrap",
    "pointer-events:none",
    "box-shadow:0 1px 6px rgba(0,0,0,0.45)",
    "transform:translate(-50%,-50%)",
  ].join(";");
  const label = new CSS2DObject(div);
  label.position.set(0, labelOffsetY, 0);
  group.add(label);

  const part: PartDef = {
    id: name,
    name,
    color,
    accent,
    group,
    base: new THREE.Vector3(base[0], base[1], base[2]),
    dir: d,
    amount,
    labelOffsetY,
    mats: [],
  };
  return { part, label };
}

/* ---------------------------------- 场景构建 ---------------------------------- */

function createTankScene(container: HTMLElement): TankScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14161a);
  scene.fog = new THREE.Fog(0x14161a, 46, 96);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  const CAM_POS = new THREE.Vector3(11, 8.2, 13.5);
  camera.position.copy(CAM_POS);
  camera.lookAt(0, 1.3, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.domElement.style.position = "absolute";
  renderer.domElement.style.inset = "0";
  renderer.domElement.style.display = "block";
  container.appendChild(renderer.domElement);

  // 环境贴图：让金属/装甲材质有真实的反光层次
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(container.clientWidth, container.clientHeight);
  labelRenderer.domElement.style.position = "absolute";
  labelRenderer.domElement.style.inset = "0";
  labelRenderer.domElement.style.pointerEvents = "none";
  container.appendChild(labelRenderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 1.3, 0);
  controls.minDistance = 4;
  controls.maxDistance = 44;
  controls.maxPolarAngle = Math.PI / 2.05;

  // 灯光
  const hemi = new THREE.HemisphereLight(0x93a7c8, 0x2e3026, 0.6);
  scene.add(hemi);
  const dirLight = new THREE.DirectionalLight(0xfff4e0, 2.2);
  dirLight.position.set(9, 15, 7);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  dirLight.shadow.camera.left = -15;
  dirLight.shadow.camera.right = 15;
  dirLight.shadow.camera.top = 15;
  dirLight.shadow.camera.bottom = -15;
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = 42;
  scene.add(dirLight);
  const rim = new THREE.DirectionalLight(0xc8d4ee, 0.5);
  rim.position.set(-9, 6, -11);
  scene.add(rim);

  // 地面
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(64, 64),
    new THREE.MeshStandardMaterial({ color: 0x1a1c21, roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(48, 48, 0x434a58, 0x272b33);
  grid.position.y = 0.01;
  scene.add(grid);

  /* ================= 坦克建模 =================
   * 坐标约定：坦克头朝 +Z；X 为左右；Y 为上下。
   * 履带中心 x = ±1.98；车体半宽 1.6；车体顶 y ≈ 0.9。
   */
  const parts: PartDef[] = [];
  const wheels: THREE.Mesh[] = []; // 运行时旋转
  const beltMats: THREE.MeshStandardMaterial[] = []; // 履带滚动

  const C = {
    olive: 0x5b6640,
    oliveMid: 0x65714a,
    oliveLight: 0x6f7c50,
    oliveDark: 0x454c30,
    oliveDeep: 0x33391f,
    steel: 0x3f454d,
    steelDark: 0x2b2f35,
    rubber: 0x212429,
    metal: 0x555b66,
  };

  // —— 车体（解构基准，不移动）——
  const hull = makePart("车体 Hull", "#5b6542", "#ffd24d", [0, 0, 0], [0, 0, 0], 0, 2.1);
  {
    const g = hull.part.group;
    // 下部主车体
    addMesh(g, new THREE.BoxGeometry(3.35, 0.5, 6.35), flat(C.oliveDark), [0, 0.28, 0]);
    // 上部车体（轻微内收，形成"腰部"层次）
    addMesh(g, new THREE.BoxGeometry(3.15, 0.4, 6.1), flat(C.olive), [0, 0.7, 0]);
    // 首下装甲（下反角）
    addMesh(g, makeSlopedBox(3.1, 0.42, 0.85, 0.5), flat(C.oliveMid), [0, 0.28, 2.95]);
    // 首上装甲（大倾角楔形）
    addMesh(g, makeSlopedBox(3.05, 0.75, 1.1, -0.72), flat(C.oliveLight), [0, 0.78, 2.42]);
    // 首上第二层（更陡的小斜面，加强层次）
    addMesh(g, makeSlopedBox(2.92, 0.3, 0.85, -0.45), flat(C.oliveMid), [0, 1.2, 2.1]);
    // 驾驶员舱盖 + 潜望镜
    addMesh(g, new THREE.CylinderGeometry(0.3, 0.34, 0.08, 16), flat(C.oliveDark), [0, 1.42, 2.55]);
    addMesh(g, new THREE.BoxGeometry(0.2, 0.06, 0.3), flat(C.steelDark), [0, 1.48, 2.55]);
    // 侧裙板（覆盖悬挂，带前部斜切）
    addMesh(g, new THREE.BoxGeometry(0.06, 0.62, 5.5), flat(C.oliveDark), [1.66, 0.3, 0]);
    addMesh(g, new THREE.BoxGeometry(0.06, 0.62, 5.5), flat(C.oliveDark), [-1.66, 0.3, 0]);
    // 裙板铰链垂片
    for (const sx of [1, -1]) {
      addMesh(g, new THREE.BoxGeometry(0.1, 0.55, 0.28), flat(C.oliveDeep), [sx * 1.68, 0.3, 2.2]);
      addMesh(g, new THREE.BoxGeometry(0.1, 0.55, 0.28), flat(C.oliveDeep), [sx * 1.68, 0.3, -2.3]);
    }
    // 前挡泥板
    for (const sx of [1, -1]) {
      addMesh(g, new THREE.BoxGeometry(0.62, 0.04, 1.5), flat(C.oliveDark), [sx * 1.55, 0.44, 2.75]);
    }
    // 前车灯
    for (const sx of [0.55, -0.55]) {
      addMesh(g, new THREE.BoxGeometry(0.15, 0.15, 0.08), flat(0x9aa0ac), [sx, 0.62, 3.18]);
    }
    // 发动机舱后高台 + 散热格栅
    addMesh(g, new THREE.BoxGeometry(3.05, 0.2, 1.65), flat(C.oliveDark), [0, 1.18, -2.15]);
    for (let i = -2; i <= 2; i++) {
      addMesh(g, new THREE.BoxGeometry(2.8, 0.03, 0.14), flat(C.oliveDeep), [0, 1.3, -2.15 + i * 0.34]);
    }
    // 尾部排气管 + 尾灯
    for (const sx of [0.75, -0.75]) {
      addMesh(g, new THREE.CylinderGeometry(0.09, 0.09, 0.5, 10), std(C.steelDark, { roughness: 0.5, metalness: 0.7 }), [sx, 1.0, -3.2]);
      addMesh(g, new THREE.BoxGeometry(0.14, 0.12, 0.06), flat(0x8a2020), [sx, 1.12, -3.2]);
    }
    // 车尾工具箱
    addMesh(g, new THREE.BoxGeometry(0.6, 0.3, 0.55), flat(C.oliveMid), [0, 1.05, -3.15]);
    // 车尾油桶 ×2
    for (const sx of [1.1, -1.1]) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.55, 12), std(C.olive, { roughness: 0.7, metalness: 0.25 }));
      barrel.position.set(sx, 0.95, -3.0);
      barrel.castShadow = true;
      g.add(barrel);
      addMesh(g, new THREE.CylinderGeometry(0.06, 0.06, 0.06, 10), flat(C.steelDark), [sx, 1.25, -3.0]);
    }
    // 天线
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.5, 6), std(C.steelDark, { roughness: 0.4, metalness: 0.8 }));
    antenna.position.set(1.15, 1.25, 2.1);
    antenna.rotation.z = 0.08;
    antenna.castShadow = false;
    g.add(antenna);
  }

  // —— 履带（含顶部护罩）——
  const tracks = makePart("履带 Track", "#3c4048", "#7dff6a", [0, 0.4, -0.03], [1, 0, 0], 0.35, 1.4);
  {
    const g = tracks.part.group;
    const treadTex = makeTreadTexture();
    const mat = new THREE.MeshStandardMaterial({
      map: treadTex,
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0.05,
    });
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.56, 1.05, 6.8), mat);
    belt.castShadow = true;
    belt.receiveShadow = true;
    g.add(belt);
    beltMats.push(mat);
    // 履带顶部护罩
    for (const sx of [1, -1]) {
      const guard = addMesh(g, new THREE.BoxGeometry(0.62, 0.09, 6.4), flat(C.oliveDark), [sx * 1.98, 0.95, 0]);
      guard.castShadow = true;
    }
  }

  // —— 负重轮 ×12 ——
  const roadWheels = makePart("负重轮 Road wheels", "#2c3038", "#ffc84d", [0, 0.42, 0], [1, 0, 0], 1.85, 1.5);
  {
    const wheelZ = [-2.15, -1.29, -0.43, 0.43, 1.29, 2.15];
    for (const z of wheelZ) {
      for (const x of [1.7, -1.7]) {
        const w = makeWheel(0.36, 0.28, 0x202328, 0x464c56);
        w.position.set(x, 0.42, z);
        roadWheels.part.group.add(w);
        wheels.push(w);
      }
    }
  }

  // —— 主动轮 ×2（后）——
  const sprockets = makePart("主动轮 Drive sprocket", "#3d4249", "#ffc84d", [0, 0.42, -2.75], [1, 0.25, -0.4], 2.1, 1.35);
  {
    for (const x of [1.7, -1.7]) {
      const s = makeSprocket(0.5, 0.28, 0x2c3036, 9);
      s.position.set(x, 0.42, -2.75);
      sprockets.part.group.add(s);
      wheels.push(s);
    }
  }

  // —— 诱导轮 ×2（前）——
  const idlers = makePart("诱导轮 Idler", "#444a52", "#ffc84d", [0, 0.42, 2.78], [1, 0.25, 0.4], 2.1, 1.35);
  {
    for (const x of [1.7, -1.7]) {
      const w = makeWheel(0.4, 0.26, 0x2c3036, 0x464c56);
      w.position.set(x, 0.42, 2.78);
      idlers.part.group.add(w);
      wheels.push(w);
    }
  }

  // —— 托带轮 ×6 ——
  const rollers = makePart("托带轮 Return roller", "#3d4249", "#ffc84d", [0, 0.92, -0.45], [1, 0, 0], 1.85, 1.15);
  {
    for (const z of [-1.85, -0.45, 0.95]) {
      for (const x of [1.7, -1.7]) {
        const w = makeWheel(0.16, 0.2, 0x24272c, 0x464c56);
        w.position.set(x, 0.92, z);
        rollers.part.group.add(w);
        wheels.push(w);
      }
    }
  }

  // —— 扭杆悬挂（减震臂 + 扭杆端）——
  const suspension = makePart("扭杆悬挂 Torsion suspension", "#4a4f3a", "#ffd24d", [0, 0.2, 0], [1, 0.12, 0], 1.05, 1.15);
  {
    const wheelZ = [-2.15, -1.29, -0.43, 0.43, 1.29, 2.15];
    for (const z of wheelZ) {
      for (const x of [1, -1]) {
        const arm = addMesh(
          suspension.part.group,
          new THREE.BoxGeometry(1.05, 0.11, 0.15),
          flat(C.steel),
          [x * 1.08, 0.14, z],
        );
        arm.castShadow = false;
        arm.receiveShadow = false;
        // 轮轴端头
        const axle = addMesh(
          suspension.part.group,
          new THREE.CylinderGeometry(0.05, 0.05, 0.24, 8).rotateZ(Math.PI / 2) as unknown as THREE.BufferGeometry,
          std(C.steelDark, { roughness: 0.4, metalness: 0.8 }),
          [x * 1.6, 0.14, z],
        );
        axle.castShadow = false;
        // 扭杆短节（伸向车体中心）
        const bar = addMesh(
          suspension.part.group,
          new THREE.CylinderGeometry(0.045, 0.045, 0.5, 8).rotateZ(Math.PI / 2) as unknown as THREE.BufferGeometry,
          std(C.steelDark, { roughness: 0.6, metalness: 0.6 }),
          [x * 0.6, 0.14, z],
        );
        bar.castShadow = false;
      }
    }
  }

  // —— 炮塔（多面体轮廓 + 炮盾 + 舱盖 + 烟雾弹 + 机枪）——
  const turret = makePart("炮塔 Turret", "#4f593c", "#ffd24d", [0, 0.9, 0], [0, 1, 0], 2.4, 1.2);
  {
    const g = turret.part.group;
    // 座圈
    addMesh(g, new THREE.CylinderGeometry(1.26, 1.32, 0.16, 28), flat(C.oliveDeep), [0, 0.03, 0]);
    // 炮塔主体（前高后低的楔形轮廓）
    addMesh(g, makeSlopedBox(2.7, 0.58, 3.2, -0.38), flat(C.olive), [0, 0.45, 0.05]);
    // 前楔形装甲（正面大倾角）
    addMesh(g, makeSlopedBox(2.55, 0.5, 1.0, -0.62), flat(C.oliveLight), [0, 0.66, 1.45]);
    // 顶部（前倾的顶盖）
    addMesh(g, makeSlopedBox(2.35, 0.14, 2.4, 0.32), flat(C.oliveMid), [0, 0.78, 0]);
    // 尾舱
    addMesh(g, new THREE.BoxGeometry(1.95, 0.52, 0.8), flat(C.oliveDark), [0, 0.52, -1.85]);
    // 炮盾（炮管根部装甲）
    addMesh(g, new THREE.BoxGeometry(0.95, 0.78, 0.5), flat(C.oliveDark), [0, 0.56, 1.92]);
    // 车长舱盖 + 潜望镜
    addMesh(g, new THREE.CylinderGeometry(0.34, 0.37, 0.22, 18), flat(C.oliveDark), [0, 1.02, -0.55]);
    addMesh(g, new THREE.CylinderGeometry(0.26, 0.28, 0.06, 18), flat(C.oliveMid), [0, 1.14, -0.55]);
    addMesh(g, new THREE.BoxGeometry(0.22, 0.05, 0.3), flat(C.steelDark), [0, 1.18, -0.55]);
    // 装填手舱盖
    addMesh(g, new THREE.CylinderGeometry(0.28, 0.3, 0.1, 16), flat(C.oliveDark), [0.85, 0.98, 0.15]);
    // 高射机枪（车长舱盖上）
    const mg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.55, 8), std(C.steelDark, { roughness: 0.45, metalness: 0.75 }));
    mg.position.set(0.35, 1.3, -0.5);
    mg.rotation.x = Math.PI / 2 - 0.25;
    mg.castShadow = true;
    g.add(mg);
    addMesh(g, new THREE.BoxGeometry(0.16, 0.1, 0.3), flat(C.steelDark), [0.35, 1.18, -0.5]);
    // 烟雾弹发射器 ×8（左右各 4）
    for (const sx of [1, -1]) {
      for (let i = 0; i < 4; i++) {
        const launcher = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 10), std(C.oliveDeep, { roughness: 0.6, metalness: 0.3 }));
        launcher.position.set(sx * 1.32, 0.78 + i * 0.14, 1.25 - i * 0.06);
        launcher.rotation.x = -0.25 * sx;
        launcher.castShadow = true;
        g.add(launcher);
      }
    }
    // 侧工具箱
    for (const sx of [1, -1]) {
      addMesh(g, new THREE.BoxGeometry(0.5, 0.22, 0.9), flat(C.oliveDark), [sx * 1.36, 0.68, -0.85]);
    }

    // —— 炮管（分段：根段/炮身/热护套/抽烟装置/制退器）——
    const barrelMat = std(C.oliveDeep, { roughness: 0.65, metalness: 0.45 });
    const rootGeo = new THREE.CylinderGeometry(0.11, 0.098, 1.0, 16);
    rootGeo.rotateX(Math.PI / 2);
    const root = new THREE.Mesh(rootGeo, barrelMat);
    root.position.set(0, 0.56, 1.4);
    root.rotation.x = 0.045;
    root.castShadow = true;
    g.add(root);
    const tubeGeo = new THREE.CylinderGeometry(0.082, 0.075, 2.2, 16);
    tubeGeo.rotateX(Math.PI / 2);
    const tube = new THREE.Mesh(tubeGeo, barrelMat);
    tube.position.set(0, 0.555, 2.95);
    tube.rotation.x = 0.045;
    tube.castShadow = true;
    g.add(tube);
    // 热护套环
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(0.095, 0.095, 0.05, 14).rotateX(Math.PI / 2) as unknown as THREE.BufferGeometry,
        std(C.oliveDark, { roughness: 0.5, metalness: 0.5 }),
      );
      ring.position.set(0, 0.555, 2.4 + i * 0.42);
      ring.rotation.x = 0.045;
      ring.castShadow = true;
      g.add(ring);
    }
    // 抽烟装置
    const evac = new THREE.Mesh(
      new THREE.CylinderGeometry(0.115, 0.115, 0.28, 14).rotateX(Math.PI / 2) as unknown as THREE.BufferGeometry,
      std(C.oliveMid, { roughness: 0.6, metalness: 0.4 }),
    );
    evac.position.set(0, 0.554, 3.3);
    evac.rotation.x = 0.045;
    evac.castShadow = true;
    g.add(evac);
    // 制退器（两段开槽块）
    for (const [z, sz] of [[3.95, 0.24], [4.12, 0.19]] as const) {
      addMesh(g, new THREE.BoxGeometry(0.27, 0.25, sz), flat(C.steelDark), [0, 0.55, z]);
    }
  }

  // —— 弹药架（炮塔尾舱）——
  const ammo = makePart("弹药架 Ammo rack", "#8a7a5a", "#ff8f5a", [0, 1.5, -1.55], [0, 1.3, -1], 1.5, 1.25);
  {
    const g = ammo.part.group;
    addMesh(g, new THREE.BoxGeometry(0.95, 0.7, 0.6), flat(0x3a3628), [0, 0.22, 0]);
    // 炮弹 ×5
    for (let i = 0; i < 5; i++) {
      const shellGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.6, 12);
      shellGeo.rotateZ(Math.PI / 2);
      const shell = new THREE.Mesh(shellGeo, std(0xc9a24a, { roughness: 0.35, metalness: 0.85 }));
      shell.position.set(-0.36 + i * 0.18, 0.55, 0);
      shell.castShadow = true;
      g.add(shell);
      // 弹头
      const tip = new THREE.Mesh(
        new THREE.ConeGeometry(0.055, 0.14, 12).rotateZ(Math.PI / 2) as unknown as THREE.BufferGeometry,
        std(0x9a7c3a, { roughness: 0.4, metalness: 0.8 }),
      );
      tip.position.set(-0.36 + i * 0.18 + 0.37, 0.55, 0);
      tip.castShadow = true;
      g.add(tip);
    }
  }

  // —— 发动机（气缸组 + 涡轮 + 飞轮）——
  const engine = makePart("发动机 Engine", "#6e6250", "#ff6b35", [0, 0.5, -2.3], [0, 1.3, -1], 1.7, 1.35);
  {
    const g = engine.part.group;
    addMesh(g, new THREE.BoxGeometry(2.2, 0.6, 1.55), flat(0x5a5145, { roughness: 0.75, metalness: 0.4 }), [0, 0, 0]);
    // 气缸盖（两排共 8 个缸）
    for (const row of [0.32, 0.46]) {
      for (let i = 0; i < 4; i++) {
        const cyl = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10).rotateZ(Math.PI / 2) as unknown as THREE.BufferGeometry,
          std(0x4a4238, { roughness: 0.6, metalness: 0.6 }),
        );
        cyl.position.set(-1.2 + i * 0.55, row, 0.4);
        cyl.castShadow = true;
        g.add(cyl);
      }
    }
    // 进气管
    addMesh(g, new THREE.CylinderGeometry(0.06, 0.07, 0.75, 10).rotateX(Math.PI / 2) as unknown as THREE.BufferGeometry, std(0x8a3f35, { roughness: 0.5, metalness: 0.6 }), [0, 0.62, -0.1]);
    // 涡轮增压器
    const turbo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 0.45, 14).rotateZ(Math.PI / 2) as unknown as THREE.BufferGeometry,
      std(0x33363b, { roughness: 0.45, metalness: 0.75 }),
    );
    turbo.position.set(0, 0.12, -0.55);
    turbo.castShadow = true;
    g.add(turbo);
    // 油底壳
    addMesh(g, new THREE.BoxGeometry(2.1, 0.14, 1.3), flat(0x4a4238), [0, -0.34, 0]);
    // 飞轮
    const flywheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 0.12, 12).rotateZ(Math.PI / 2) as unknown as THREE.BufferGeometry,
      std(0x3f454d, { roughness: 0.45, metalness: 0.75 }),
    );
    flywheel.position.set(0, 0, -0.82);
    flywheel.castShadow = true;
    g.add(flywheel);
  }

  // —— 变速箱 ——
  const transmission = makePart("变速箱 Transmission", "#454b56", "#4da3ff", [0, 0.48, -3.15], [0, 1.4, -1.8], 1.5, 1.25);
  {
    const g = transmission.part.group;
    addMesh(g, new THREE.BoxGeometry(1.95, 0.58, 0.95), flat(0x39404c, { roughness: 0.6, metalness: 0.6 }), [0, 0, 0]);
    // 顶盖
    addMesh(g, new THREE.BoxGeometry(1.6, 0.14, 0.7), flat(0x2f3540), [0, 0.36, 0]);
    // 输出轴（向后伸向主动轮）
    addMesh(g, new THREE.CylinderGeometry(0.13, 0.13, 0.55, 12).rotateX(Math.PI / 2) as unknown as THREE.BufferGeometry, std(0x23262b, { roughness: 0.4, metalness: 0.85 }), [0, 0, 0.52]);
    // 法兰盘
    addMesh(g, new THREE.CylinderGeometry(0.2, 0.2, 0.06, 12).rotateZ(Math.PI / 2) as unknown as THREE.BufferGeometry, std(0x454b56, { roughness: 0.5, metalness: 0.7 }), [0, 0, -0.5]);
  }

  // —— 油箱（带箍环 + 加油口）——
  const fuel = makePart("油箱 Fuel tank", "#5c6a45", "#ffd24d", [1.45, 0.72, -2.3], [1.2, 0.7, -0.8], 1.2, 1.05);
  {
    const g = fuel.part.group;
    addMesh(g, new THREE.BoxGeometry(0.56, 0.5, 0.95), flat(0x4e5a3a, { roughness: 0.8, metalness: 0.3 }), [0, 0, 0]);
    // 箍环 ×2
    for (const y of [-0.12, 0.14]) {
      addMesh(g, new THREE.CylinderGeometry(0.3, 0.3, 0.06, 14).rotateZ(Math.PI / 2) as unknown as THREE.BufferGeometry, std(0x2c2f26, { roughness: 0.5, metalness: 0.6 }), [0, y, 0]);
    }
    addMesh(g, new THREE.CylinderGeometry(0.07, 0.07, 0.1, 10), flat(C.steelDark), [0, 0.32, 0]);
  }

  // —— 驾驶舱（座椅 / 仪表 / 操纵装置）——
  const driver = makePart("驾驶舱 Driver cabin", "#7a6a4a", "#ffd24d", [0, 0.55, 2.35], [0, 1.1, 1.4], 1.3, 1.15);
  {
    const g = driver.part.group;
    // 座椅靠背 + 座面
    addMesh(g, new THREE.BoxGeometry(0.6, 0.5, 0.12), flat(0x6a5c40, { roughness: 0.9, metalness: 0.1 }), [0, 0.1, -0.1]);
    addMesh(g, new THREE.BoxGeometry(0.62, 0.1, 0.45), flat(0x6a5c40, { roughness: 0.9, metalness: 0.1 }), [0, -0.18, 0.08]);
    // 仪表板
    addMesh(g, new THREE.BoxGeometry(0.85, 0.22, 0.12), flat(0x2c2f26, { roughness: 0.7, metalness: 0.2 }), [0, 0.12, 0.32]);
    // 方向盘
    const wheelMesh = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.022, 10, 22), std(0x24262b, { roughness: 0.45, metalness: 0.5 }));
    wheelMesh.position.set(0, 0.16, 0.28);
    wheelMesh.rotation.x = Math.PI / 2.4;
    wheelMesh.castShadow = true;
    g.add(wheelMesh);
    // 操纵杆
    for (const sx of [0.3, -0.3]) {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8), std(0x24262b, { roughness: 0.5, metalness: 0.4 }));
      stick.position.set(sx, 0.0, 0.24);
      stick.rotation.x = 0.3;
      stick.castShadow = true;
      g.add(stick);
    }
  }

  // —— 散热 / 排气 ——
  const exhaust = makePart("散热排气 Exhaust", "#565b60", "#7dff6a", [0, 1.02, -3.0], [0, 1.2, -2.4], 1.1, 0.95);
  {
    const g = exhaust.part.group;
    addMesh(g, new THREE.BoxGeometry(1.5, 0.24, 0.7), flat(0x41464c, { roughness: 0.85, metalness: 0.4 }), [0, 0, 0]);
    // 格栅条
    for (let i = -2; i <= 2; i++) {
      addMesh(g, new THREE.BoxGeometry(1.3, 0.02, 0.1), flat(0x2b2e33), [0, 0.13, i * 0.12]);
    }
    // 排气管
    for (const sx of [0.45, -0.45]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.5, 10), std(0x2b2e33, { roughness: 0.45, metalness: 0.75 }));
      pipe.position.set(sx, 0.38, 0);
      pipe.castShadow = true;
      g.add(pipe);
      addMesh(g, new THREE.BoxGeometry(0.2, 0.12, 0.14), flat(0x2b2e33), [sx, 0.2, 0]);
    }
  }

  // 收集各部件材质（用于高亮）
  const collect = (part: PartDef) => {
    part.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const m = o.material as THREE.MeshStandardMaterial;
        if (m && m.isMeshStandardMaterial) part.mats.push(m);
      }
    });
  };
  parts.forEach(collect);

  // 场景内注册
  const allParts: PartDef[] = [
    hull.part, tracks.part, roadWheels.part, sprockets.part, idlers.part, rollers.part,
    suspension.part, turret.part, ammo.part, engine.part, transmission.part, fuel.part,
    driver.part, exhaust.part,
  ];
  for (const p of allParts) scene.add(p.group);

  /* ================= 动力传递演示 ================= */
  const powerPoints = [
    new THREE.Vector3(0, 0.75, -2.3), // 发动机
    new THREE.Vector3(0, 0.55, -3.1), // 变速箱
    new THREE.Vector3(1.55, 0.45, -2.75), // 主动轮
    new THREE.Vector3(1.72, 0.12, -2.0), // 履带下缘后
    new THREE.Vector3(1.72, 0.12, 2.5), // 履带下缘前
    new THREE.Vector3(1.72, 0.95, 2.5), // 履带上缘前
    new THREE.Vector3(1.72, 0.95, -2.0), // 履带上缘后
  ];
  const powerCurve = new THREE.CatmullRomCurve3(powerPoints, true, "catmullrom", 0.4);

  const chainTube = new THREE.Mesh(
    new THREE.TubeGeometry(powerCurve, 120, 0.05, 8),
    new THREE.MeshBasicMaterial({
      color: 0xff9a3c,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
  );
  chainTube.visible = false;
  scene.add(chainTube);

  const dotMat = new THREE.MeshBasicMaterial({ color: 0xff9a3c });
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), dotMat);
  dot.visible = false;
  scene.add(dot);
  // 光点拖尾
  const trailMat = new THREE.MeshBasicMaterial({
    color: 0xff9a3c,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
  const trail = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), trailMat);
  trail.visible = false;
  scene.add(trail);

  /* ================= 交互状态 ================= */
  let targetExplode = 0;
  let currentExplode = 0;
  let running = false;
  let showLabels = true;
  let speed = 1;
  let exploded = false;
  let dotTime = 0;
  let stageTimer = 0;
  let stage = 0;
  const stageColors = [0xff6b35, 0x4da3ff, 0xffc84d, 0x7dff6a];

  const highlights = new Map<string, number>(); // part id → 当前高亮强度

  const api: TankScene = {
    setExplode: (v) => { targetExplode = v; },
    setRunning: (v) => { running = v; },
    setSpeed: (v) => { speed = v; },
    setShowLabels: (v) => { showLabels = v; },
    setAutoRotate: (v) => { controls.autoRotate = v; controls.autoRotateSpeed = 1.4; },
    resetView: () => {
      camera.position.copy(CAM_POS);
      controls.target.set(0, 1.3, 0);
      controls.update();
    },
    dispose: () => { disposed = true; },
  };

  // 高亮强度推进
  const tickHighlights = (dt: number) => {
    const active = running ? stage : -1;
    const targets = new Map<string, number>();
    if (active >= 0) {
      const id = [engine.part, transmission.part, sprockets.part, tracks.part][active].id;
      targets.set(id, 1);
    }
    for (const p of allParts) {
      const cur = highlights.get(p.id) ?? 0;
      const want = targets.get(p.id) ?? 0;
      const next = cur + (want - cur) * Math.min(1, dt * 5);
      highlights.set(p.id, next);
      if (next > 0.001) {
        const c = new THREE.Color(p.accent);
        for (const m of p.mats) {
          m.emissive.copy(c).multiplyScalar(Math.min(next, 0.9));
          m.emissiveIntensity = 1;
        }
      } else {
        for (const m of p.mats) { m.emissive.setHex(0x000000); m.emissiveIntensity = 1; }
      }
    }
    // 光点颜色随阶段
    if (running) {
      dotMat.color.setHex(stageColors[stage]);
      trailMat.color.setHex(stageColors[stage]);
    }
  };

  // 每帧渲染
  const clock = new THREE.Clock();
  let disposed = false;
  let raf = 0;

  const tick = () => {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    // 解构缓动
    currentExplode += (targetExplode - currentExplode) * Math.min(1, dt * 3.4);
    exploded = currentExplode > 0.08;
    for (const p of allParts) {
      p.group.position.copy(p.base).addScaledVector(p.dir, currentExplode * p.amount);
    }
    // 标注显隐
    for (const p of allParts) {
      const label = p.group.children.find((o) => o instanceof CSS2DObject);
      if (label) label.visible = showLabels && exploded;
    }

    // 运行演示
    if (running) {
      const ang = dt * speed * 2.4;
      for (const w of wheels) w.rotation.x += ang;
      for (const m of beltMats) {
        if (m.map) m.map.offset.x = (m.map.offset.x + dt * speed * 0.42) % 1;
      }
      dotTime = (dotTime + dt * speed * 0.22) % 1;
      const pos = powerCurve.getPoint(dotTime);
      dot.position.copy(pos);
      const back = powerCurve.getPoint(Math.max(0, dotTime - 0.05));
      trail.position.copy(back);
      chainTube.visible = true;
      dot.visible = true;
      trail.visible = true;
      // 阶段轮换
      stageTimer += dt;
      if (stageTimer > 2.0) {
        stageTimer = 0;
        stage = (stage + 1) % 4;
        api.onStage?.(stage);
      }
    } else {
      chainTube.visible = false;
      dot.visible = false;
      trail.visible = false;
      dotTime = 0;
      stage = 0;
    }

    tickHighlights(dt);

    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  };
  tick();

  // 尺寸自适应
  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  return api;
}

/* ---------------------------------- React 视图 ---------------------------------- */

const LEGEND: Array<{ name: string; color: string }> = [
  { name: "车体", color: "#5b6542" },
  { name: "履带", color: "#3c4048" },
  { name: "负重轮", color: "#2c3038" },
  { name: "主动轮", color: "#3d4249" },
  { name: "诱导轮", color: "#444a52" },
  { name: "扭杆悬挂", color: "#4a4f3a" },
  { name: "炮塔/炮管", color: "#4f593c" },
  { name: "弹药架", color: "#8a7a5a" },
  { name: "发动机", color: "#6e6250" },
  { name: "变速箱", color: "#454b56" },
  { name: "油箱", color: "#5c6a45" },
  { name: "驾驶舱", color: "#7a6a4a" },
  { name: "散热排气", color: "#565b60" },
];

const STAGES: Array<{ title: string; desc: string; color: string }> = [
  { title: "① 发动机做功", desc: "柴油在发动机气缸内燃烧，活塞往复运动输出扭矩。", color: "#ff6b35" },
  { title: "② 变速箱变速", desc: "变速箱把发动机扭矩变速变矩，传递给两侧主动轮。", color: "#4da3ff" },
  { title: "③ 主动轮驱动", desc: "主动轮咬合履带齿，带动整条履带向后卷绕。", color: "#ffc84d" },
  { title: "④ 履带推进", desc: "履带向后推地，地面反作用力推动坦克前进，负重轮在履带上滚动。", color: "#7dff6a" },
];

const TankView: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<TankScene | null>(null);

  const [mode, setMode] = useState<Mode>("run");
  const [explodeLevel, setExplodeLevel] = useState(45);
  const [autoRotate, setAutoRotate] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [stage, setStage] = useState(0);

  // 场景只创建一次
  useEffect(() => {
    if (!containerRef.current) return;
    const scene = createTankScene(containerRef.current);
    sceneRef.current = scene;
    scene.onStage = (s) => setStage(s);
    scene.setExplode(45 / 100);
    scene.setRunning(true);
    scene.setShowLabels(true);
    scene.setAutoRotate(true);
    scene.setSpeed(1);
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { sceneRef.current?.setExplode(explodeLevel / 100); }, [explodeLevel]);
  useEffect(() => { sceneRef.current?.setRunning(mode === "run"); }, [mode]);
  useEffect(() => { sceneRef.current?.setShowLabels(showLabels); }, [showLabels]);
  useEffect(() => { sceneRef.current?.setAutoRotate(autoRotate); }, [autoRotate]);
  useEffect(() => { sceneRef.current?.setSpeed(speed); }, [speed]);

  const changeMode = (m: Mode) => {
    setMode(m);
    if (m === "assemble") setExplodeLevel(0);
    else if (m === "explode") setExplodeLevel(100);
    else setExplodeLevel(45);
  };

  const stageInfo = STAGES[stage];

  return (
    <div style={{ display: "flex", gap: 12, height: "100%", minHeight: 560, padding: 16 }}>
      <Card
        size="small"
        title="控制面板"
        style={{ width: 292, flexShrink: 0, alignSelf: "flex-start" }}
      >
        <Typography.Text strong style={{ fontSize: 13 }}>演示模式</Typography.Text>
        <Radio.Group
          style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}
          value={mode}
          onChange={(e) => changeMode(e.target.value as Mode)}
        >
          <Radio.Button value="assemble">整体视图</Radio.Button>
          <Radio.Button value="explode">结构分解</Radio.Button>
          <Radio.Button value="run">运行原理</Radio.Button>
        </Radio.Group>

        <Divider style={{ margin: "12px 0" }} />

        <Typography.Text strong style={{ fontSize: 13 }}>分解程度</Typography.Text>
        <Slider
          min={0}
          max={100}
          value={explodeLevel}
          onChange={(v) => setExplodeLevel(v)}
          tooltip={{ formatter: (v) => `${v}%` }}
        />

        <Divider style={{ margin: "12px 0" }} />

        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <Space style={{ width: "100%", justifyContent: "space-between" }}>
            <span>自动旋转</span>
            <Switch checked={autoRotate} onChange={setAutoRotate} size="small" />
          </Space>
          <Space style={{ width: "100%", justifyContent: "space-between" }}>
            <span>显示标注</span>
            <Switch checked={showLabels} onChange={setShowLabels} size="small" />
          </Space>
          <Space style={{ width: "100%", justifyContent: "space-between" }}>
            <span>演示速度</span>
            <Slider
              style={{ width: 150 }}
              min={0.2}
              max={3}
              step={0.1}
              value={speed}
              disabled={mode !== "run"}
              onChange={setSpeed}
            />
          </Space>
          <Button block onClick={() => sceneRef.current?.resetView()}>
            重置视角
          </Button>
        </Space>

        {mode === "run" && (
          <>
            <Divider style={{ margin: "12px 0" }} />
            <Typography.Text strong style={{ fontSize: 13 }}>动力传递链</Typography.Text>
            <div
              style={{
                marginTop: 8,
                padding: "8px 10px",
                borderRadius: 8,
                border: `1px solid ${stageInfo.color}`,
                background: "rgba(0,0,0,0.35)",
              }}
            >
              <Tag color={stageInfo.color} style={{ marginBottom: 4 }}>{stageInfo.title}</Tag>
              <Typography.Text style={{ fontSize: 12, color: "#c8ccd4", display: "block" }}>
                {stageInfo.desc}
              </Typography.Text>
            </div>
          </>
        )}

        <Divider style={{ margin: "12px 0" }} />
        <Typography.Text strong style={{ fontSize: 13 }}>部件图例</Typography.Text>
        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: "4px 10px" }}>
          {LEGEND.map((it) => (
            <span key={it.name} style={{ fontSize: 12, color: "#9aa0ab", whiteSpace: "nowrap" }}>
              <span
                style={{
                  display: "inline-block",
                  width: 9,
                  height: 9,
                  borderRadius: 2,
                  background: it.color,
                  marginRight: 4,
                }}
              />
              {it.name}
            </span>
          ))}
        </div>
      </Card>

      <div
        ref={containerRef}
        style={{
          position: "relative",
          flex: 1,
          borderRadius: 10,
          overflow: "hidden",
          border: "1px solid #2a2e36",
          background: "#14161a",
          minHeight: 560,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 12,
            zIndex: 5,
            color: "#7c838f",
            fontSize: 12,
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          左键拖动旋转 · 滚轮缩放 · 右键平移
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 10,
            left: 12,
            zIndex: 5,
            color: "#565c66",
            fontSize: 11,
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          程序化三维模型（three.js）· 模拟教学示意，非精确比例
        </div>
      </div>
    </div>
  );
};

export default TankView;
