/*
 * Module Federation build for a FatNotes bespoke plugin.
 *
 * IMPORTANT — Module Federation name alignment:
 * When FatNotes registers a bespoke plugin, the host assigns it a UUID and
 * expects the MF remote name to equal `plugin_<uuid_with_underscores>`
 * (unless `mfName` is overridden in the host-side manifest or plugin.json).
 * If the names don't match you'll get:
 *   "[ Federation Runtime ]: remoteEntryExports is undefined"
 *
 * Resolution priority for the MF name used at build time:
 *   1. `PLUGIN_MF_NAME` env var (highest) — e.g.
 *        $env:PLUGIN_MF_NAME="plugin_xxxxxxxx_xxxx_xxxx_xxxx_xxxxxxxxxxxx"
 *   2. `plugin.json` -> `mfName` field.
 *   3. `plugin.json` -> `container` field (scaffold default).
 *   4. Fallback: `plugin_f8af04a7_d7e0_4153_92ad_6bed90db61bf`.
 *
 * After installing your plugin in FatNotes, copy the UUID shown in the host
 * plugin list into `plugin.json` as the `mfName` field, then rebuild.
 *
 * All `shared` entries MUST be singleton and version-aligned with the host
 * (FatNotes) to avoid hook mismatches.
 */
const path = require("path");
const {
  ModuleFederationPlugin,
} = require("@module-federation/enhanced/webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const manifest = require("./plugin.json");

const MF_NAME =
  process.env.PLUGIN_MF_NAME ||
  manifest.mfName ||
  manifest.container ||
  "plugin_f8af04a7_d7e0_4153_92ad_6bed90db61bf";

module.exports = (_, argv) => {
  const isProd = argv && argv.mode === "production";
  // eslint-disable-next-line no-console
  console.log(`[f8af04a7-d7e0-4153-92ad-6bed90db61bf] building remoteEntry as MF name: "${MF_NAME}"`);
  return {
    entry: "./src/bootstrap.ts",
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "[name].[contenthash:8].js",
      // 开发态使用稳定 chunk 名，避免 watch 重编译后旧运行时请求已清理的内容哈希文件
      chunkFilename: isProd ? "[name].[contenthash:8].js" : "[name].js",
      publicPath: "auto",
      clean: true,
    },
    resolve: {
      extensions: [".ts", ".tsx", ".js", ".jsx"],
    },
    module: {
      rules: [
        {
          test: /\.(ts|tsx)$/,
          use: {
            loader: "ts-loader",
            options: { transpileOnly: true },
          },
          exclude: /node_modules/,
        },
        {
          test: /\.(css|less)$/,
          use: [
            "style-loader",
            {
              loader: "css-loader",
              options: {
                modules: {
                  // 让普通 .less 也支持 `import styles from "./xxx.less"`
                  // .css 仍按原来的全局样式方式处理。
                  auto: (resourcePath) => resourcePath.endsWith(".less"),
                  // 保持 `import styles from "./xxx.less"` 的默认导出写法。
                  namedExport: false,
                  localIdentName: "[local]_[hash:base64:5]",
                },
              },
            },
            "less-loader",
          ],
        },
        {
          test: /\.(png|jpe?g|gif|svg)$/i,
          type: "asset/resource",
        },
      ],
    },
    plugins: [
      new ModuleFederationPlugin({
        name: MF_NAME,
        filename: "remoteEntry.js",
        // Force the runtime container to be assigned on the global (window)
        // scope. Without this, @module-federation/enhanced defaults to a
        // `var`-style output wrapped in an IIFE, and the host's
        // @module-federation/runtime fails with
        //   "[ Federation Runtime ]: remoteEntryExports is undefined".
        library: { type: "global", name: MF_NAME },
        exposes: {
          "./plugin": "./src/index.tsx",
        },
        shared: {
          react: { singleton: true, requiredVersion: "18.2.0", eager: false },
          "react-dom": {
            singleton: true,
            requiredVersion: "18.2.0",
            eager: false,
          },
          "react/jsx-runtime": {
            singleton: true,
            requiredVersion: "18.2.0",
            eager: false,
          },
          "react-redux": {
            singleton: true,
            requiredVersion: "9.1.2",
            eager: false,
          },
          "react-intl": {
            singleton: true,
            requiredVersion: "6.8.4",
            eager: false,
          },
          antd: { singleton: true, requiredVersion: "6.3.1", eager: false },
        },
      }),
      // Optional demo shell for standalone development.
      new HtmlWebpackPlugin({ template: "./public/index.html" }),
    ],
    devtool: isProd ? false : "source-map",
    optimization: { minimize: isProd },
  };
};
