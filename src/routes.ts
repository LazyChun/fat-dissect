/*
 * 路由定义 —— fat-dissect 插件内所有路由都挂在 /dissect 前缀下。
 */

/** 路由前缀（宿主全局路由空间内本插件的命名空间） */
export const ROUTE_PREFIX = "/dissect";

/** 首页路由 */
export const HOME_PATH = `${ROUTE_PREFIX}/home`;

/** 坦克 3D 解构路由 */
export const TANK_PATH = `${ROUTE_PREFIX}/tank`;

/** 故宫太和殿 3D 解构路由 */
export const PALACE_PATH = `${ROUTE_PREFIX}/palace`;

/** 判断某个路径是否属于本插件 */
export function isDissectRoute(path: string): boolean {
  return path === ROUTE_PREFIX || path.startsWith(`${ROUTE_PREFIX}/`);
}
