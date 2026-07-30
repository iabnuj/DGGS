# 通用入格契约：引用 + 格内片段

**日期:** 2026-07-30  
**状态:** 实现中（矢量已落地，栅格结构预留）

## 契约

每条 `GridCellRecord`：

| 字段 | 含义 |
|------|------|
| `ref` | 原始对象引用（`objectId` / `uri` / `kind`） |
| `fragment` | 已裁到本格的内容：`vector` 几何或 `raster` chip 描述 |

查询只 `getByCell`；上图只画 `fragment`，不做实时相交。

## 矢量

入格时按穿过的格剪裁 LineString/Polygon，写入 `fragment`。

## 栅格（后续）

同一 `ref` + `fragment.kind: "raster"`（`bbox` / `chipUri`），上图走同一 `CellFragmentLayer` 分支。
