# @dggs/demo

Cesium 汇报 Demo（**React + shadcn 深色壳**）。

## 能力

| 区域 | 说明 |
|------|------|
| 格网数据 | GeoJSON / GeoTIFF（桌面）导入入格、图层显隐/定位/删除；栅格含 chip 上图 |
| 格网显示 | 网格显隐、层级、边框/填充、拉伸 |
| 地图显示 | 底图、光照等 |
| 地图工具条 | 顶部：2D/3D、点选 / 画线 / 画面选格、清除 |
| 右侧详情 | 选中格入格内容、尺度卷粗/细化、片段上图 |
| 品牌 | `public/logo.svg` + `build/icon.png`（桌面/页签图标） |
| 底栏 | 实时经纬度、GridCode、FPS、格数 |

## 开发启动

在仓库根目录：

```bash
pnpm install
pnpm build:store          # 桌面 SQLite 仓需要
pnpm demo                 # 浏览器 http://127.0.0.1:5173/
pnpm demo:electron        # Electron 窗口
```

设计 / 计划：

- `docs/superpowers/specs/2026-07-29-demo-ui-design.md`
- `docs/superpowers/plans/2026-07-29-demo-react-ui.md`

浏览器使用 `MemoryWarehouse`；桌面主进程使用 `SqliteWarehouse`。
