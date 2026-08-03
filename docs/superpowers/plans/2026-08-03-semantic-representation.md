# 语义表征 Implementation Plan

> **For agentic workers:** Use task-by-task execution. Steps use checkbox syntax.

**Goal:** 交付方案 A：格级语义向量、要素识别赋码、检索上色、格网挤出白模与外部 glTF/3D Tiles。

**Architecture:** `@dggs/grid-semantic` 纯函数库 + Demo `SemanticTab` 写仓/检索 + `WhiteModelLayer` / `ExternalModelLayer` 可视化。

**Tech Stack:** TypeScript、vitest、Cesium、现有 GridWarehouse / Zustand。

## Global Constraints

- 无外部 GPU；默认 `hist-v1` 直方图特征，接口可替换。
- embedding 存 `attrs.embedding` JSON 字符串。
- 白模①挤出 + ③外部模型都要；不自动重建 mesh。

---

## Task 1: `@dggs/grid-semantic` 包

- [x] 脚手架 package.json / tsup / vitest
- [x] `cosine` / `l2Normalize` / `embedHistRgba` / `embedTextPrototype` / `searchTopK` / `labelFromSource`
- [x] 单测通过；根目录 `build:semantic` / `test:semantic`

## Task 2: Demo 语义写入与检索 UI

- [x] `SemanticTab` + LeftDrawer 入口
- [x] 从 layers/records 生成 semantic records 并 `warehouse.put`
- [x] 文本/选中格检索 → `setAnalysisResults`
- [x] RightPanel 展示 class/score

## Task 3: 白模层

- [x] `WhiteModelLayer`：按 codes + 高度挤出
- [x] `ExternalModelLayer`：glTF 文件 + 3D Tiles URL
- [x] SemanticTab / Map 控制显隐；`useCesiumMap` runtime 挂载

## Task 4: 文档与提交

- [x] 更新 `apps/demo/README.md` 功能表
- [ ] 提交（待用户确认）
