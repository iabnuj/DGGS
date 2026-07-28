# DGGS

数字战场离散全球网格（DGGS）工作区：领域梳理 + 编码核 + Cesium Demo。

## 结构

```text
docs/                     领域与设计文档
packages/grid-core/       网格编码核 @dggs/grid-core
apps/demo/                Cesium 汇报 Demo
```

## 快速开始

```bash
# 安装（需 Node 18+、pnpm）
pnpm install

# 构建编码核
pnpm build:core

# 启动 Demo
pnpm demo
```

浏览器打开 Vite 提示的地址（默认 http://localhost:5173）。

### Demo 操作

1. 地球默认定位北京周边，绿色半透明为视窗 `coverBBox` 格子  
2. 滚轮缩放：勾选「随相机高度自动调级」时层级会变化  
3. 点击格子：左侧显示编码、范围；若落在样例区可见多源属性  
4. **上钻 / 下钻**：调用 `algebra.parent` / `children`  
5. 红色半透明：告警面上格样例；蓝/橙点：侦察与气象样例  

### 编码核单独测试

```bash
pnpm test:core
```

## 文档

- [数字战场 DGGS 领域梳理](./docs/数字战场-DGGS领域梳理.md)
- [grid-core 设计说明](./docs/superpowers/specs/2026-07-27-grid-core-design.md)
