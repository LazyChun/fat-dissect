/*
 * PalaceView — 故宫太和殿 3D 模型 + 解构动画 + 建筑结构解析
 *
 * 全部模型用 three.js 基础几何体程序化搭建（无需外部模型文件）：
 *   - 台基：三层汉白玉须弥座 + 栏杆望柱 + 螭首 + 正面三重踏跺
 *   - 月台：台基前方平台 + 丹陛石
 *   - 柱网：檐柱（外圈）+ 金柱（内圈）+ 柱础
 *   - 斗拱：额枋 / 平板枋之上的层叠斗拱
 *   - 梁架：大梁 / 檩 / 上层围脊承托（青绿彩画）
 *   - 屋顶：重檐庑殿顶（黄琉璃瓦、正脊吻兽、垂脊走兽）
 *   - 门窗：正面三交六椀菱花隔扇、匾额
 *
 * 三种模式：
 *   - 整体视图：完整装配，可自由旋转观察外形
 *   - 结构分解：各构件沿解构方向（多数向上）平滑"爆炸"分离，配合双语标注看清单体构造
 *   - 结构解析：半分解 + 承重 / 构造链演示（台基→柱网→斗拱→梁架→屋顶），
 *               力流光点沿传力路径循环，分阶段高亮讲解
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
import {
  CSS2DRenderer,
  CSS2DObject,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

type Mode = "assemble" | "explode" | "structure";

interface PartDef {
  id: string;
  name: string;
  color: string;
  accent: string; // 结构解析时的高亮色
  group: THREE.Group;
  base: THREE.Vector3;
  dir: THREE.Vector3;
  amount: number;
  labelOffsetY: number;
  mats: THREE.MeshStandardMaterial[];
}

interface PalaceScene {
  setExplode: (v: number) => void;
  setStructure: (v: boolean) => void;
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

/** 机械 / 建筑构件常用：平面着色，突出棱角 */
function flat(
  color: number,
  opts?: Partial<THREE.MeshStandardMaterialParameters>,
): THREE.MeshStandardMaterial {
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

/** 在两点之间放一根截面为 w×h 的梁（用于垂脊、栏杆栏板） */
function beamBetween(
  parent: THREE.Object3D,
  a: THREE.Vector3,
  b: THREE.Vector3,
  w: number,
  h: number,
  mat: THREE.Material,
): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, len), mat);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    dir.clone().normalize(),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** 庑殿顶（四面坡）几何体：底矩形 w×d、正脊长 ridgeLen、高 h */
function makeHipRoof(
  w: number,
  d: number,
  h: number,
  ridgeLen: number,
): THREE.BufferGeometry {
  const hw = w / 2;
  const hd = d / 2;
  const hl = ridgeLen / 2;
  const pos = new Float32Array([
    -hw,
    0,
    -hd, // 0 底 后左
    hw,
    0,
    -hd, // 1 底 后右
    hw,
    0,
    hd, // 2 底 前右
    -hw,
    0,
    hd, // 3 底 前左
    -hl,
    h,
    0, // 4 脊 左
    hl,
    h,
    0, // 5 脊 右
  ]);
  const uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1, 0.5, 0.35, 0.5, 0.35]);
  const idx = [
    3,
    2,
    5,
    3,
    5,
    4, // 前坡
    0,
    5,
    1,
    0,
    4,
    5, // 后坡
    1,
    5,
    2, // 右歇山三角
    0,
    3,
    4, // 左歇山三角
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** 琉璃瓦纹理：竖向筒瓦棱纹 + 横向瓦垄 */
function makeRoofTileTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#c8922c";
  ctx.fillRect(0, 0, 128, 128);
  // 筒瓦（竖向半圆棱）
  for (let i = 0; i < 8; i++) {
    const x = i * 16;
    const grd = ctx.createLinearGradient(x, 0, x + 16, 0);
    grd.addColorStop(0, "#8f6418");
    grd.addColorStop(0.5, "#f2d271");
    grd.addColorStop(1, "#8f6418");
    ctx.fillStyle = grd;
    ctx.fillRect(x, 0, 16, 128);
  }
  // 瓦垄横线
  ctx.strokeStyle = "rgba(90,58,12,0.55)";
  ctx.lineWidth = 2;
  for (let y = 0; y <= 128; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(128, y);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 5);
  tex.anisotropy = 8;
  return tex;
}

/** 三交六椀菱花隔扇纹理（红底金线） */
function makeLatticeTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#8f2a22";
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = "#e8c765";
  ctx.lineWidth = 2;
  for (let i = -128; i < 256; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 128, 128);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i + 128, 0);
    ctx.lineTo(i, 128);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#d9b64a";
  for (let i = 0; i <= 128; i += 16) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(128, i);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 128);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 1.2);
  tex.anisotropy = 8;
  return tex;
}

/** 匾额纹理：蓝底金字「太和殿」+ 金框 */
function makePlaqueTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 96;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#1f3a5f";
  ctx.fillRect(0, 0, 256, 96);
  ctx.strokeStyle = "#d9b64a";
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, 248, 88);
  ctx.fillStyle = "#e8c765";
  ctx.font = "bold 58px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("太和殿", 128, 52);
  return new THREE.CanvasTexture(c);
}

/** 一组斗拱（坐斗 + 交叉拱 + 升），返回可复用的 Group */
function makeDougong(
  matWood: THREE.Material,
  matGold: THREE.Material,
): THREE.Group {
  const g = new THREE.Group();
  addMesh(g, new THREE.BoxGeometry(0.34, 0.2, 0.34), matWood, [0, 0, 0]); // 坐斗
  addMesh(g, new THREE.BoxGeometry(0.92, 0.12, 0.16), matGold, [0, 0.16, 0]); // 华拱
  addMesh(g, new THREE.BoxGeometry(0.16, 0.12, 0.92), matGold, [0, 0.28, 0]); // 泥道拱
  addMesh(g, new THREE.BoxGeometry(0.16, 0.12, 0.16), matWood, [-0.36, 0.3, 0]); // 散斗
  addMesh(g, new THREE.BoxGeometry(0.16, 0.12, 0.16), matWood, [0.36, 0.3, 0]); // 散斗
  return g;
}

/** 沿一条直线边布置栏杆（望柱 + 栏板） */
function addRailingEdge(
  parent: THREE.Object3D,
  a: THREE.Vector3,
  b: THREE.Vector3,
  matPost: THREE.Material,
  matPanel: THREE.Material,
): void {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const n = Math.max(2, Math.round(len / 1.0));
  const step = 1 / n;
  for (let i = 0; i <= n; i++) {
    const p = a.clone().addScaledVector(dir, i * step);
    addMesh(parent, new THREE.BoxGeometry(0.1, 0.5, 0.1), matPost, [
      p.x,
      p.y,
      p.z,
    ]);
    if (i < n) {
      const p2 = a.clone().addScaledVector(dir, (i + 1) * step);
      beamBetween(parent, p, p2, 0.06, 0.3, matPanel);
    }
  }
}

/** 一层踏跺（实心阶梯块）：从 zStart 到 zEnd 逐级升高 rise */
function addStairs(
  parent: THREE.Object3D,
  w: number,
  zStart: number,
  zEnd: number,
  rise: number,
  steps: number,
  mat: THREE.Material,
): void {
  const stepDepth = (zEnd - zStart) / steps;
  for (let i = 0; i < steps; i++) {
    const h = ((i + 1) / steps) * rise;
    addMesh(parent, new THREE.BoxGeometry(w, h, stepDepth), mat, [
      0,
      h / 2,
      zStart + (i + 0.5) * stepDepth,
    ]);
  }
}

/** 螭首（台基外沿的龙首排水口）：沿矩形前三边排布的小凸块 */
function addChishouBand(
  parent: THREE.Object3D,
  w: number,
  d: number,
  y: number,
  mat: THREE.Material,
): void {
  const hw = w / 2;
  const hd = d / 2;
  const step = 1.3;
  for (let x = -hw + 0.6; x <= hw - 0.6; x += step) {
    addMesh(parent, new THREE.BoxGeometry(0.26, 0.18, 0.34), mat, [
      x,
      y,
      hd + 0.16,
    ]);
  }
  for (let z = -hd + 0.6; z <= hd - 0.6; z += step) {
    addMesh(parent, new THREE.BoxGeometry(0.34, 0.18, 0.26), mat, [
      hw + 0.16,
      y,
      z,
    ]);
    addMesh(parent, new THREE.BoxGeometry(0.34, 0.18, 0.26), mat, [
      -hw - 0.16,
      y,
      z,
    ]);
  }
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

/** 太和殿主要尺寸（场景单位，示意比例） */
const HALL = {
  halfW: 5.5, // 殿身半宽（面阔 11）
  halfD: 3.1, // 殿身半深（进深 6.2）
  baseTop: 1.4, // 台基顶面高
  colH: 2.4, // 檐柱高
};
const COL_TOP = HALL.baseTop + HALL.colH; // 3.8
const GOLDEN_TOP = 4.6; // 金柱顶

function createPalaceScene(container: HTMLElement): PalaceScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14161a);
  scene.fog = new THREE.Fog(0x14161a, 58, 120);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
  const CAM_POS = new THREE.Vector3(16, 10, 19);
  camera.position.copy(CAM_POS);
  camera.lookAt(0, 3.4, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.domElement.style.position = "absolute";
  renderer.domElement.style.inset = "0";
  renderer.domElement.style.display = "block";
  container.appendChild(renderer.domElement);

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
  controls.target.set(0, 3.4, 0);
  controls.minDistance = 6;
  controls.maxDistance = 56;
  controls.maxPolarAngle = Math.PI / 2.05;

  // 灯光
  const hemi = new THREE.HemisphereLight(0xbcd0ea, 0x3a3428, 0.65);
  scene.add(hemi);
  const dirLight = new THREE.DirectionalLight(0xfff2da, 2.3);
  dirLight.position.set(12, 18, 10);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  dirLight.shadow.camera.left = -20;
  dirLight.shadow.camera.right = 20;
  dirLight.shadow.camera.top = 20;
  dirLight.shadow.camera.bottom = -20;
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = 60;
  scene.add(dirLight);
  const rim = new THREE.DirectionalLight(0xc8d4ee, 0.55);
  rim.position.set(-12, 8, -14);
  scene.add(rim);

  // 地面（广场）
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 90),
    new THREE.MeshStandardMaterial({
      color: 0x26241f,
      roughness: 0.98,
      metalness: 0,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(70, 70, 0x4a4a44, 0x2c2c28);
  grid.position.y = 0.01;
  scene.add(grid);

  /* ================= 太和殿建模 =================
   * 坐标约定：坐北朝南，正面朝 +Z；X 为左右；Y 为上下。
   * 台基顶面 y = 1.4；檐柱顶 y = 3.8；重檐上层正脊 y ≈ 6.85。
   */
  const C = {
    marble: 0xe9e5dc,
    marbleDark: 0xcbc5b8,
    red: 0x9c2b24,
    redDark: 0x7c2019,
    wood: 0xc98a2e,
    green: 0x2f6b5e,
    greenDark: 0x24544a,
    gold: 0xd4af37,
    roofBase: 0xb8842a,
    ridge: 0x8f6418,
    stone: 0x8f8a80,
  };

  const roofMat = new THREE.MeshStandardMaterial({
    map: makeRoofTileTexture(),
    roughness: 0.42,
    metalness: 0.32,
    side: THREE.DoubleSide,
  });
  const marbleMat = flat(C.marble, { roughness: 0.9, metalness: 0.05 });
  const marbleDarkMat = flat(C.marbleDark, { roughness: 0.9, metalness: 0.05 });
  const redMat = flat(C.red, { roughness: 0.72, metalness: 0.08 });
  const greenMat = flat(C.green, { roughness: 0.7, metalness: 0.12 });
  const goldMat = std(C.gold, { roughness: 0.35, metalness: 0.85 });
  const ridgeMat = flat(C.ridge, { roughness: 0.5, metalness: 0.45 });
  const woodMat = flat(C.wood, { roughness: 0.6, metalness: 0.2 });

  const parts: PartDef[] = [];

  // —— 台基（解构基准，不位移）——
  const base = makePart(
    "台基 Platform",
    "#e8e2d6",
    "#ffffff",
    [0, 0, 0],
    [0, 0, 0],
    0,
    1.9,
  );
  {
    const g = base.part.group;
    // 三层须弥座（自下而上收分）
    const tiers: Array<[number, number, number]> = [
      [17, 0.5, 12.4],
      [15.6, 0.45, 10.8],
      [14.2, 0.45, 9.2],
    ];
    let yTop = 0;
    for (let ti = 0; ti < tiers.length; ti++) {
      const [w, h, d] = tiers[ti];
      const cy = yTop + h / 2;
      addMesh(g, new THREE.BoxGeometry(w, h, d), marbleMat, [0, cy, 0]);
      // 须弥座上下枭（压面深色带）
      addMesh(
        g,
        new THREE.BoxGeometry(w + 0.12, 0.08, d + 0.12),
        marbleDarkMat,
        [0, yTop + 0.04, 0],
      );
      addMesh(
        g,
        new THREE.BoxGeometry(w + 0.12, 0.08, d + 0.12),
        marbleDarkMat,
        [0, yTop + h - 0.04, 0],
      );
      // 螭首排水口（顶层正面被月台遮挡，略去）
      if (ti < tiers.length - 1) {
        addChishouBand(g, w, d, yTop + h - 0.2, marbleDarkMat);
      }
      yTop += h;
    }
    // 顶部与中层栏杆（望柱 + 栏板）
    const postMat = flat(C.marble, { roughness: 0.85, metalness: 0.05 });
    const panelMat = flat(C.marbleDark, { roughness: 0.9, metalness: 0.05 });
    const railRect = (w: number, d: number, y: number) => {
      const hw = w / 2;
      const hd = d / 2;
      const fl = new THREE.Vector3(-hw, y, hd);
      const fr = new THREE.Vector3(hw, y, hd);
      const bl = new THREE.Vector3(-hw, y, -hd);
      const br = new THREE.Vector3(hw, y, -hd);
      addRailingEdge(g, fl, fr, postMat, panelMat);
      addRailingEdge(g, bl, br, postMat, panelMat);
      addRailingEdge(g, fl, bl, postMat, panelMat);
      addRailingEdge(g, fr, br, postMat, panelMat);
    };
    railRect(14.2, 9.2, 1.4);
    railRect(15.6, 10.8, 0.95);
  }

  // —— 月台（台基前方平台 + 丹陛石）——
  const terrace = makePart(
    "月台 Terrace",
    "#ddd7ca",
    "#ffffff",
    [0, 0, 0],
    [0, 0.5, 1],
    1.3,
    1.9,
  );
  {
    const g = terrace.part.group;
    // 月台实体（与台基顶层齐平，坐落在第一层台基之上）
    addMesh(
      g,
      new THREE.BoxGeometry(10.4, 0.9, 1.6),
      marbleMat,
      [0, 0.95, 5.4],
    );
    addMesh(
      g,
      new THREE.BoxGeometry(10.5, 0.08, 1.7),
      marbleDarkMat,
      [0, 1.36, 5.4],
    );
    // 丹陛石（御路石雕）
    addMesh(
      g,
      new THREE.BoxGeometry(3.0, 0.14, 1.4),
      flat(C.marbleDark, { roughness: 0.8, metalness: 0.05 }),
      [0, 1.47, 5.4],
    );
    // 月台栏杆（前 + 两侧，后侧通殿身敞开）
    const postMat = flat(C.marble, { roughness: 0.85, metalness: 0.05 });
    const panelMat = flat(C.marbleDark, { roughness: 0.9, metalness: 0.05 });
    const fl = new THREE.Vector3(-5.2, 1.4, 6.2);
    const fr = new THREE.Vector3(5.2, 1.4, 6.2);
    const bl = new THREE.Vector3(-5.2, 1.4, 4.6);
    const brr = new THREE.Vector3(5.2, 1.4, 4.6);
    addRailingEdge(g, fl, fr, postMat, panelMat);
    addRailingEdge(g, fl, bl, postMat, panelMat);
    addRailingEdge(g, fr, brr, postMat, panelMat);
    // 月台前踏跺（正面大台阶）
    addStairs(g, 6, 6.2, 8.0, 1.4, 7, marbleMat);
  }

  // —— 柱网（檐柱 + 金柱 + 柱础）——
  const columns = makePart(
    "柱网 Columns",
    "#9c2b24",
    "#ff6b5a",
    [0, 0, 0],
    [0, 1, 0],
    1.5,
    4.2,
  );
  {
    const g = columns.part.group;
    const colMat = flat(C.red, { roughness: 0.65, metalness: 0.08 });
    const plinthMat = flat(C.stone, { roughness: 0.95, metalness: 0.05 });
    const addColumn = (x: number, z: number, r: number, top: number) => {
      const h = top - HALL.baseTop;
      addMesh(g, new THREE.CylinderGeometry(r * 0.92, r, h, 18), colMat, [
        x,
        HALL.baseTop + h / 2,
        z,
      ]);
      addMesh(
        g,
        new THREE.CylinderGeometry(r * 1.5, r * 1.6, 0.12, 18),
        plinthMat,
        [x, HALL.baseTop + 0.06, z],
      );
      // 柱顶雀替（横向小枋）
      addMesh(g, new THREE.BoxGeometry(0.5, 0.14, 0.5), colMat, [
        x,
        top - 0.05,
        z,
      ]);
    };
    // 檐柱：前后各 7，两侧各 4，四角 4
    const xs = [-5.0, -3.33, -1.67, 0, 1.67, 3.33, 5.0];
    for (const x of xs) {
      addColumn(x, +HALL.halfD, 0.16, COL_TOP);
      addColumn(x, -HALL.halfD, 0.16, COL_TOP);
    }
    for (const z of [-2.0, -0.7, 0.7, 2.0]) {
      addColumn(+5.4, z, 0.16, COL_TOP);
      addColumn(-5.4, z, 0.16, COL_TOP);
    }
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        addColumn(sx * 5.4, sz * HALL.halfD, 0.16, COL_TOP);
      }
    }
    // 金柱（内圈承重柱，更高）
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        addColumn(sx * 2.2, sz * 1.3, 0.22, GOLDEN_TOP);
      }
    }
  }

  // —— 斗拱（额枋 / 平板枋 + 层叠斗拱）——
  const brackets = makePart(
    "斗拱 Bracket sets",
    "#c98a2e",
    "#ffc84d",
    [0, 0, 0],
    [0, 1, 0],
    2.1,
    4.7,
  );
  {
    const g = brackets.part.group;
    const archMat = flat(C.redDark, { roughness: 0.7, metalness: 0.1 });
    const plateMat = flat(C.green, { roughness: 0.7, metalness: 0.12 });
    const yArch = COL_TOP - 0.18; // 额枋
    const yPlate = COL_TOP + 0.06; // 平板枋
    // 前后额枋
    addMesh(g, new THREE.BoxGeometry(11.4, 0.32, 0.32), archMat, [
      0,
      yArch,
      HALL.halfD,
    ]);
    addMesh(g, new THREE.BoxGeometry(11.4, 0.32, 0.32), archMat, [
      0,
      yArch,
      -HALL.halfD,
    ]);
    // 两侧额枋
    addMesh(g, new THREE.BoxGeometry(0.32, 0.32, 6.5), archMat, [
      5.4,
      yArch,
      0,
    ]);
    addMesh(g, new THREE.BoxGeometry(0.32, 0.32, 6.5), archMat, [
      -5.4,
      yArch,
      0,
    ]);
    // 平板枋
    addMesh(g, new THREE.BoxGeometry(11.8, 0.16, 0.46), plateMat, [
      0,
      yPlate,
      HALL.halfD,
    ]);
    addMesh(g, new THREE.BoxGeometry(11.8, 0.16, 0.46), plateMat, [
      0,
      yPlate,
      -HALL.halfD,
    ]);
    addMesh(g, new THREE.BoxGeometry(0.46, 0.16, 6.7), plateMat, [
      5.4,
      yPlate,
      0,
    ]);
    addMesh(g, new THREE.BoxGeometry(0.46, 0.16, 6.7), plateMat, [
      -5.4,
      yPlate,
      0,
    ]);
    // 斗拱阵列
    const yDou = COL_TOP + 0.28;
    const wood = flat(C.wood, { roughness: 0.6, metalness: 0.2 });
    const place = (x: number, y: number, z: number, rotY: number) => {
      const dg = makeDougong(wood, archMat);
      dg.position.set(x, y, z);
      dg.rotation.y = rotY;
      g.add(dg);
    };
    for (let x = -5.4; x <= 5.4 + 0.01; x += 1.2) {
      place(x, yDou, HALL.halfD, 0);
      place(x, yDou, -HALL.halfD, 0);
    }
    for (let z = -2.4; z <= 2.4 + 0.01; z += 1.2) {
      place(5.4, yDou, z, Math.PI / 2);
      place(-5.4, yDou, z, Math.PI / 2);
    }
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        place(sx * 5.4, yDou, sz * HALL.halfD, Math.PI / 4);
      }
    }
  }

  // —— 梁架（大梁 / 檩 / 上层围脊承托）——
  const beams = makePart(
    "梁架 Beams",
    "#2f6b5e",
    "#4fe0c0",
    [0, 0, 0],
    [0, 1, 0],
    2.7,
    5.0,
  );
  {
    const g = beams.part.group;
    const beamMat = flat(C.green, { roughness: 0.7, metalness: 0.12 });
    const beamDark = flat(C.greenDark, { roughness: 0.72, metalness: 0.12 });
    // 大梁（沿进深方向架在檐柱 / 金柱上）
    const yBeam = COL_TOP + 0.42;
    for (const x of [-5.0, -3.33, -1.67, 0, 1.67, 3.33, 5.0]) {
      addMesh(g, new THREE.BoxGeometry(0.3, 0.34, 6.6), beamMat, [x, yBeam, 0]);
    }
    // 檩（沿面阔方向）
    for (const z of [-2.4, -0.8, 0.8, 2.4]) {
      addMesh(g, new THREE.BoxGeometry(11.4, 0.24, 0.24), beamDark, [
        0,
        yBeam + 0.22,
        z,
      ]);
    }
    // 金柱上大梁（承托上层）
    const yUpper = GOLDEN_TOP + 0.3;
    for (const sx of [1, -1]) {
      addMesh(g, new THREE.BoxGeometry(0.3, 0.34, 4.4), beamMat, [
        sx * 2.2,
        yUpper,
        0,
      ]);
    }
    addMesh(g, new THREE.BoxGeometry(5.8, 0.3, 0.3), beamDark, [
      0,
      yUpper,
      1.3,
    ]);
    addMesh(g, new THREE.BoxGeometry(5.8, 0.3, 0.3), beamDark, [
      0,
      yUpper,
      -1.3,
    ]);
    // 上层围脊承托（两重檐之间的矮墙）
    addMesh(
      g,
      new THREE.BoxGeometry(9.6, 0.66, 5.2),
      flat(C.red, { roughness: 0.72, metalness: 0.1 }),
      [0, 4.88, 0],
    );
  }

  // —— 下檐（重檐下层屋面）——
  const roofLower = makePart(
    "下檐 Roof (lower)",
    "#d9a441",
    "#ffe08a",
    [0, 0, 0],
    [0, 1, 0],
    3.3,
    5.1,
  );
  {
    const g = roofLower.part.group;
    const y0 = 4.2;
    addMesh(g, makeHipRoof(12.6, 7.6, 0.62, 6.0), roofMat, [0, y0, 0]);
    // 檐口（屋面下缘加厚一圈）
    addMesh(g, new THREE.BoxGeometry(12.7, 0.16, 0.3), ridgeMat, [
      0,
      y0 + 0.02,
      3.75,
    ]);
    addMesh(g, new THREE.BoxGeometry(12.7, 0.16, 0.3), ridgeMat, [
      0,
      y0 + 0.02,
      -3.75,
    ]);
    addMesh(g, new THREE.BoxGeometry(0.3, 0.16, 7.7), ridgeMat, [
      6.25,
      y0 + 0.02,
      0,
    ]);
    addMesh(g, new THREE.BoxGeometry(0.3, 0.16, 7.7), ridgeMat, [
      -6.25,
      y0 + 0.02,
      0,
    ]);
  }

  // —— 上檐（重檐上层庑殿顶 + 正脊吻兽 + 垂脊走兽）——
  const roofUpper = makePart(
    "上檐 Roof (upper)",
    "#e0ad3f",
    "#ffe08a",
    [0, 0, 0],
    [0, 1, 0],
    3.9,
    7.2,
  );
  {
    const g = roofUpper.part.group;
    const y0 = 5.15;
    const w = 9.8;
    const d = 5.6;
    const h = 1.7;
    const ridgeLen = 4.2;
    addMesh(g, makeHipRoof(w, d, h, ridgeLen), roofMat, [0, y0, 0]);
    // 檐口加厚
    addMesh(g, new THREE.BoxGeometry(w + 0.1, 0.18, 0.3), ridgeMat, [
      0,
      y0 + 0.02,
      d / 2,
    ]);
    addMesh(g, new THREE.BoxGeometry(w + 0.1, 0.18, 0.3), ridgeMat, [
      0,
      y0 + 0.02,
      -d / 2,
    ]);
    addMesh(g, new THREE.BoxGeometry(0.3, 0.18, d + 0.1), ridgeMat, [
      w / 2,
      y0 + 0.02,
      0,
    ]);
    addMesh(g, new THREE.BoxGeometry(0.3, 0.18, d + 0.1), ridgeMat, [
      -w / 2,
      y0 + 0.02,
      0,
    ]);
    // 正脊
    const ridgeY = y0 + h;
    addMesh(g, new THREE.BoxGeometry(ridgeLen + 0.4, 0.34, 0.5), ridgeMat, [
      0,
      ridgeY + 0.08,
      0,
    ]);
    // 正脊两端的吻兽
    for (const sx of [1, -1]) {
      const x = sx * (ridgeLen / 2 + 0.16);
      addMesh(g, new THREE.BoxGeometry(0.5, 0.62, 0.46), ridgeMat, [
        x,
        ridgeY + 0.28,
        0,
      ]);
      const horn = new THREE.Mesh(
        new THREE.ConeGeometry(0.25, 0.55, 4),
        goldMat,
      );
      horn.position.set(x, ridgeY + 0.75, 0);
      horn.rotation.z = -sx * 0.35;
      horn.castShadow = true;
      g.add(horn);
    }
    // 垂脊（四条由正脊两端斜下到四角）
    const hl = ridgeLen / 2;
    const hw = w / 2;
    const hd = d / 2;
    const ridgeL = new THREE.Vector3(-hl, ridgeY, 0);
    const ridgeR = new THREE.Vector3(hl, ridgeY, 0);
    const corners = [
      new THREE.Vector3(-hw, y0, hd),
      new THREE.Vector3(hw, y0, hd),
      new THREE.Vector3(-hw, y0, -hd),
      new THREE.Vector3(hw, y0, -hd),
    ];
    for (const c of corners) {
      // 每条垂脊由正脊相应一端斜下到角梁
      const from = c.x > 0 ? ridgeR : ridgeL;
      beamBetween(g, from, c, 0.28, 0.28, ridgeMat);
      // 垂脊上的走兽（三只小兽）
      const dir = new THREE.Vector3().subVectors(c, from);
      for (let i = 1; i <= 3; i++) {
        const p = from.clone().addScaledVector(dir, 0.55 + i * 0.09);
        const beast = addMesh(
          g,
          new THREE.BoxGeometry(0.16, 0.2, 0.16),
          goldMat,
          [p.x, p.y + 0.16, p.z],
        );
        beast.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI / 2;
      }
    }
  }

  // —— 门窗（三交六椀菱花隔扇）——
  const doors = makePart(
    "门窗 Doors",
    "#8f2a22",
    "#ff9a7a",
    [0, 0, 0],
    [0, 0, 1],
    1.7,
    3.7,
  );
  {
    const g = doors.part.group;
    const latticeMat = new THREE.MeshStandardMaterial({
      map: makeLatticeTexture(),
      roughness: 0.7,
      metalness: 0.06,
      side: THREE.DoubleSide,
    });
    // 正面
    addMesh(g, new THREE.PlaneGeometry(10.4, 1.9), latticeMat, [
      0,
      2.35,
      HALL.halfD - 0.05,
    ]);
    // 背面
    const back = addMesh(g, new THREE.PlaneGeometry(10.4, 1.9), latticeMat, [
      0,
      2.35,
      -HALL.halfD + 0.05,
    ]);
    back.rotation.y = Math.PI;
    // 两侧
    const right = addMesh(g, new THREE.PlaneGeometry(6.0, 1.9), latticeMat, [
      5.4 - 0.05,
      2.35,
      0,
    ]);
    right.rotation.y = Math.PI / 2;
    const left = addMesh(g, new THREE.PlaneGeometry(6.0, 1.9), latticeMat, [
      -5.4 + 0.05,
      2.35,
      0,
    ]);
    left.rotation.y = -Math.PI / 2;
  }

  // —— 匾额（太和殿）——
  const plaque = makePart(
    "匾额 Plaque",
    "#1f3a5f",
    "#ffd24d",
    [0, 0, 0],
    [0, 0, 1],
    2.0,
    4.4,
  );
  {
    const g = plaque.part.group;
    const plaqueMat = new THREE.MeshStandardMaterial({
      map: makePlaqueTexture(),
      roughness: 0.5,
      metalness: 0.3,
    });
    addMesh(g, new THREE.BoxGeometry(1.7, 0.6, 0.1), plaqueMat, [
      0,
      3.3,
      HALL.halfD + 0.22,
    ]);
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
    base.part,
    terrace.part,
    columns.part,
    brackets.part,
    beams.part,
    roofLower.part,
    roofUpper.part,
    doors.part,
    plaque.part,
  ];
  for (const p of allParts) scene.add(p.group);

  /* ================= 承重 / 构造链演示 ================= */
  const flowPoints = [
    new THREE.Vector3(0, 0.55, 0), // 台基
    new THREE.Vector3(2.6, 1.6, 2.4), // 柱脚
    new THREE.Vector3(2.6, 3.75, 2.4), // 柱顶
    new THREE.Vector3(1.4, 4.15, 1.3), // 斗拱
    new THREE.Vector3(0, 4.7, 0), // 梁架
    new THREE.Vector3(0, 5.7, 0), // 上层
    new THREE.Vector3(0, 6.7, 0), // 正脊
    new THREE.Vector3(-1.4, 4.15, -1.3), // 斗拱
    new THREE.Vector3(-2.6, 3.75, -2.4), // 柱顶
    new THREE.Vector3(-2.6, 1.6, -2.4), // 柱脚
  ];
  const flowCurve = new THREE.CatmullRomCurve3(
    flowPoints,
    true,
    "catmullrom",
    0.4,
  );

  const flowTube = new THREE.Mesh(
    new THREE.TubeGeometry(flowCurve, 140, 0.06, 8),
    new THREE.MeshBasicMaterial({
      color: 0xffd24d,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    }),
  );
  flowTube.visible = false;
  scene.add(flowTube);

  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffd24d });
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16), dotMat);
  dot.visible = false;
  scene.add(dot);
  const trailMat = new THREE.MeshBasicMaterial({
    color: 0xffd24d,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
  const trail = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 12, 12),
    trailMat,
  );
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
  const stageColors = [0xffffff, 0xff6b5a, 0xffc84d, 0x4fe0c0, 0xffe08a];

  const highlights = new Map<string, number>(); // part id → 当前高亮强度

  const api: PalaceScene = {
    setExplode: (v) => {
      targetExplode = v;
    },
    setStructure: (v) => {
      running = v;
    },
    setSpeed: (v) => {
      speed = v;
    },
    setShowLabels: (v) => {
      showLabels = v;
    },
    setAutoRotate: (v) => {
      controls.autoRotate = v;
      controls.autoRotateSpeed = 1.2;
    },
    resetView: () => {
      camera.position.copy(CAM_POS);
      controls.target.set(0, 3.4, 0);
      controls.update();
    },
    dispose: () => {
      disposed = true;
    },
  };

  // 高亮强度推进
  const tickHighlights = (dt: number) => {
    const active = running ? stage : -1;
    const targets = new Map<string, number>();
    if (active >= 0) {
      const ids = [
        [base.part],
        [columns.part],
        [brackets.part],
        [beams.part],
        [roofLower.part, roofUpper.part],
      ][active];
      for (const p of ids) targets.set(p.id, 1);
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
        for (const m of p.mats) {
          m.emissive.setHex(0x000000);
          m.emissiveIntensity = 1;
        }
      }
    }
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

    // 解构缓动
    currentExplode += (targetExplode - currentExplode) * Math.min(1, dt * 3.4);
    exploded = currentExplode > 0.08;
    for (const p of allParts) {
      p.group.position
        .copy(p.base)
        .addScaledVector(p.dir, currentExplode * p.amount);
    }
    // 标注显隐
    for (const p of allParts) {
      const label = p.group.children.find((o) => o instanceof CSS2DObject);
      if (label) label.visible = showLabels && exploded;
    }

    // 结构解析演示
    if (running) {
      dotTime = (dotTime + dt * speed * 0.24) % 1;
      const pos = flowCurve.getPoint(dotTime);
      dot.position.copy(pos);
      const back = flowCurve.getPoint(Math.max(0, dotTime - 0.05));
      trail.position.copy(back);
      flowTube.visible = true;
      dot.visible = true;
      trail.visible = true;
      // 阶段轮换
      stageTimer += dt;
      if (stageTimer > 2.0) {
        stageTimer = 0;
        stage = (stage + 1) % 5;
        api.onStage?.(stage);
      }
    } else {
      flowTube.visible = false;
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
  { name: "台基", color: "#e8e2d6" },
  { name: "月台", color: "#ddd7ca" },
  { name: "柱网", color: "#9c2b24" },
  { name: "斗拱", color: "#c98a2e" },
  { name: "梁架", color: "#2f6b5e" },
  { name: "下檐", color: "#d9a441" },
  { name: "上檐", color: "#e0ad3f" },
  { name: "门窗", color: "#8f2a22" },
  { name: "匾额", color: "#1f3a5f" },
];

const STAGES: Array<{ title: string; desc: string; color: string }> = [
  {
    title: "① 台基承台",
    desc: "三层汉白玉须弥座把整座殿宇的重量均匀分散到大地上。",
    color: "#e8e2d6",
  },
  {
    title: "② 柱网传力",
    desc: "檐柱与金柱把上部荷载垂直向下传递给台基。",
    color: "#ff6b5a",
  },
  {
    title: "③ 斗拱扩载",
    desc: "斗拱层层出跳，把柱头集中荷载扩散到更宽大的屋面。",
    color: "#ffc84d",
  },
  {
    title: "④ 梁架承重",
    desc: "大梁、檩、椽纵横搭接，构成屋顶的承重骨架。",
    color: "#4fe0c0",
  },
  {
    title: "⑤ 屋顶覆压",
    desc: "重檐庑殿顶覆盖其上，屋面荷载经梁架回到柱网与台基。",
    color: "#ffe08a",
  },
];

const PalaceView: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<PalaceScene | null>(null);

  const [mode, setMode] = useState<Mode>("structure");
  const [explodeLevel, setExplodeLevel] = useState(45);
  const [autoRotate, setAutoRotate] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [stage, setStage] = useState(0);

  // 场景只创建一次
  useEffect(() => {
    if (!containerRef.current) return;
    const scene = createPalaceScene(containerRef.current);
    sceneRef.current = scene;
    scene.onStage = (s) => setStage(s);
    scene.setExplode(45 / 100);
    scene.setStructure(true);
    scene.setShowLabels(true);
    scene.setAutoRotate(true);
    scene.setSpeed(1);
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.setExplode(explodeLevel / 100);
  }, [explodeLevel]);
  useEffect(() => {
    sceneRef.current?.setStructure(mode === "structure");
  }, [mode]);
  useEffect(() => {
    sceneRef.current?.setShowLabels(showLabels);
  }, [showLabels]);
  useEffect(() => {
    sceneRef.current?.setAutoRotate(autoRotate);
  }, [autoRotate]);
  useEffect(() => {
    sceneRef.current?.setSpeed(speed);
  }, [speed]);

  const changeMode = (m: Mode) => {
    setMode(m);
    if (m === "assemble") setExplodeLevel(0);
    else if (m === "explode") setExplodeLevel(100);
    else setExplodeLevel(45);
  };

  const stageInfo = STAGES[stage];

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        height: "100%",
        minHeight: 560,
        padding: 16,
      }}
    >
      <Card
        size="small"
        title="控制面板"
        style={{ width: 292, flexShrink: 0, alignSelf: "flex-start" }}
      >
        <Typography.Text strong style={{ fontSize: 13 }}>
          演示模式
        </Typography.Text>
        <Radio.Group
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            marginTop: 8,
          }}
          value={mode}
          onChange={(e) => changeMode(e.target.value as Mode)}
        >
          <Radio.Button value="assemble">整体视图</Radio.Button>
          <Radio.Button value="explode">结构分解</Radio.Button>
          <Radio.Button value="structure">结构解析</Radio.Button>
        </Radio.Group>

        <Divider style={{ margin: "12px 0" }} />

        <Typography.Text strong style={{ fontSize: 13 }}>
          分解程度
        </Typography.Text>
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
            <Switch
              checked={autoRotate}
              onChange={setAutoRotate}
              size="small"
            />
          </Space>
          <Space style={{ width: "100%", justifyContent: "space-between" }}>
            <span>显示标注</span>
            <Switch
              checked={showLabels}
              onChange={setShowLabels}
              size="small"
            />
          </Space>
          <Space style={{ width: "100%", justifyContent: "space-between" }}>
            <span>演示速度</span>
            <Slider
              style={{ width: 150 }}
              min={0.2}
              max={3}
              step={0.1}
              value={speed}
              disabled={mode !== "structure"}
              onChange={setSpeed}
            />
          </Space>
          <Button block onClick={() => sceneRef.current?.resetView()}>
            重置视角
          </Button>
        </Space>

        {mode === "structure" && (
          <>
            <Divider style={{ margin: "12px 0" }} />
            <Typography.Text strong style={{ fontSize: 13 }}>
              承重 / 构造链
            </Typography.Text>
            <div
              style={{
                marginTop: 8,
                padding: "8px 10px",
                borderRadius: 8,
                border: `1px solid ${stageInfo.color}`,
                background: "rgba(0,0,0,0.35)",
              }}
            >
              <Tag color={stageInfo.color} style={{ marginBottom: 4 }}>
                {stageInfo.title}
              </Tag>
              <Typography.Text
                style={{ fontSize: 12, color: "#c8ccd4", display: "block" }}
              >
                {stageInfo.desc}
              </Typography.Text>
            </div>
          </>
        )}

        <Divider style={{ margin: "12px 0" }} />
        <Typography.Text strong style={{ fontSize: 13 }}>
          构件图例
        </Typography.Text>
        <div
          style={{
            marginTop: 8,
            display: "flex",
            flexWrap: "wrap",
            gap: "4px 10px",
          }}
        >
          {LEGEND.map((it) => (
            <span
              key={it.name}
              style={{ fontSize: 12, color: "#9aa0ab", whiteSpace: "nowrap" }}
            >
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
          程序化三维模型（three.js）· 故宫太和殿 · 教学示意，非精确比例
        </div>
      </div>
    </div>
  );
};

export default PalaceView;
