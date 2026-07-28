# @dggs/demo

Cesium 汇报 Demo：视窗 `coverBBox` 画格、点击看码、父子钻取、北京周边多源样例。

## 启动

在仓库根目录：

```bash
pnpm install
pnpm demo
```

打开 http://localhost:5173/

## 能力

| 操作 | 说明 |
|------|------|
| 缩放/平移 | 松手后按视窗刷新格子；可自动调级 |
| 点击格子 | 显示 GeoSOT 码与 bbox |
| 上钻 / 下钻 | `algebra.parent` / `children` |
| 红格 / 蓝橙点 | 告警面上格、侦察点、气象点样例 |

依赖 `@dggs/grid-core`（Vite alias 直连源码）。底图为 OSM，无需 Cesium Ion token。
