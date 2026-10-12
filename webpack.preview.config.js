/*
 * webpack.preview.config.js — 独立预览构建（不依赖 FatNotes 宿主）。
 *
 * 入口：src/preview.tsx（挂载 TankView 等工具）
 * 产物：dist-preview/index.html，可直接用浏览器打开验证。
 */
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = (_, argv) => {
  const isProd = argv && argv.mode === "production";
  return {
    entry: "./src/preview.tsx",
    output: {
      path: path.resolve(__dirname, "dist-preview"),
      filename: isProd ? "[name].[contenthash:8].js" : "[name].js",
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
          use: ["style-loader", "css-loader", "less-loader"],
        },
        {
          test: /\.(png|jpe?g|gif|svg)$/i,
          type: "asset/resource",
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({ template: "./public/preview.html" }),
    ],
    devtool: isProd ? false : "source-map",
    optimization: { minimize: isProd },
    performance: { hints: false },
  };
};
