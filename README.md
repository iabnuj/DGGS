# DGGS

数字战场离散全球网格（DGGS）工作区：领域梳理 + 编码核 + Cesium Demo（浏览器 / Electron 桌面）。

## 结构

```text
docs/                     领域与设计文档
packages/grid-core/       网格编码核 @dggs/grid-core
packages/grid-ingest/     多源上格 @dggs/grid-ingest
packages/grid-store/      可插拔数据仓 @dggs/grid-store（Memory / JSON / SQLite）
apps/demo/                Cesium 汇报 Demo（Vite + Electron）
```

## 快速开始

```bash
# 安装（需 Node 18+、pnpm）
pnpm install

# 构建编码核与数据仓
pnpm build:core
pnpm build:store

# 浏览器 Demo
pnpm demo

# 桌面 Demo（发给客户前可用这个验证）
pnpm demo:electron

# 打本机平台安装包 → apps/demo/release/
pnpm demo:dist
```

浏览器打开 Vite 提示的地址（默认 http://127.0.0.1:5173）。

### Demo 操作

1. 地球默认定位北京周边，视窗 `coverBBox` 画格（可开关边框/面/编码）  
2. 滚轮缩放：勾选「随相机高度自动调级」时层级会变化  
3. 点击格子：左侧显示编码、范围；若落在样例区可见多源属性  
4. **上钻 / 下钻**：调用 `algebra.parent` / `children`  
5. 红色半透明：告警面上格样例；蓝/橙点：侦察与气象样例  
6. **桌面**：菜单「文件 → 打开/保存 JSON」导入导出网格记录  

### 包测试

```bash
pnpm test:core
pnpm test:ingest
pnpm test:store
```

## 文档

- [数字战场 DGGS 领域梳理](./docs/数字战场-DGGS领域梳理.md)
- [grid-core 设计说明](./docs/superpowers/specs/2026-07-27-grid-core-design.md)
- [Demo Electron 桌面化设计](./docs/superpowers/specs/2026-07-29-demo-electron-desktop-design.md)
