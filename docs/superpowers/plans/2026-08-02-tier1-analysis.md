# 第一梯队分析能力 Implementation Plan

> **For agentic workers:** 布尔 → 增量更新 → 突击通道，可分 PR。

**Goal:** 落地布尔运算、网格增量更新演示、空中突击通道分析三条论证向能力。

**Architecture:** 算法在 `@dggs/grid-core`；Demo 用 `analysisResults` 叠加；集合 A/B 与通道参数放 Zustand。

**Tech Stack:** TypeScript, Vitest, Zustand, Cesium overlays

## Task 1: 布尔运算
- [ ] `packages/grid-core/src/boolean.ts`：union/intersect/difference + 同级对齐
- [ ] 单测；导出
- [ ] store：analysisSetA/B；RightPanel：存 A/B + 交并差

## Task 2: 增量更新
- [ ] DataTab：对场图层「增量更新」随机改 k 格并计时
- [ ] 对比提示：全量 N vs 增量 k

## Task 3: 突击通道
- [ ] `grid-core` 或 demo 内：约束过滤 + A*/BFS
- [ ] RightPanel：基于选中起终点与已导入场数据跑通道
