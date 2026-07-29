# @dggs/demo

Cesium 汇报 Demo（**React + shadcn 深色壳**）。

## 能力

| 区域 | 说明 |
|------|------|
| 显示 | 网格显隐、层级、边框/填充、拉伸 |
| 数据 | GeoJSON 导入入格、图层显隐/定位/删除 |
| 查询 | 点选 / 画线 / 画面 → GridSet |
| 分析 | 碰撞（手动）、聚合（画面 autoRun）、缓冲（点选 autoRun） |
| 地图 | 底图、光照、2D/3D、全屏、重置中国视窗 |
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
