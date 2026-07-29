# 导入 Level 估算 Implementation Plan

> **For agentic workers:** 按任务顺序实现；入格级别与相机解耦。

**Goal:** GeoJSON 导入前按几何特征建议 level，确认区可改后再入格。

**Architecture:** 纯函数 `suggestIngestLevel` + DataTab 待导入确认态；入格仍走 `ingestGeoJsonText`。

**Tech Stack:** TypeScript、Vitest（demo）、现有 Slider/Button

## Global Constraints

- Level 夹在 8–16；映射规则：`cellSize(L) ≤ d` 的最粗级
- 不解析 SHP；不改仓库 schema

---

### Task 1: suggestIngestLevel + 测试

**Files:**
- Create: `apps/demo/src/data/suggestIngestLevel.ts`
- Create: `apps/demo/test/suggestIngestLevel.test.ts`
- Modify: `apps/demo/package.json`（vitest）、`vitest.config.ts`

### Task 2: DataTab 确认 UI

**Files:**
- Modify: `apps/demo/src/components/tabs/DataTab.tsx`
