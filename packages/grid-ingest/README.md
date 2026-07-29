# @dggs/grid-ingest

多源业务上格管道：原始几何 + 语义 → `grid_id` 行记录。只依赖 `@dggs/grid-core`，**不写业务本体**。

## 一期 API

| 函数 | 几何 | 核调用 |
|------|------|--------|
| `ingestPoint` / `ingestPoints` | 点 | `locToQuaternary` |
| `ingestBBox` | 矩形面 | `coverBBox` |
| `groupByGrid` | — | 同码叠加 |
| `recordsForCell` | — | 含父子 roll-up 匹配 |

统一输出：

```ts
{ gridId, level, time?, source, label?, attrs }
```

## 非本期

- `ingestLine` / `ingestPolygon`（等 `coverLine` / `coverPolygon`）
- 持久化仓、语义字典、时空指标

## 开发

```bash
pnpm --filter @dggs/grid-ingest test
pnpm --filter @dggs/grid-ingest build
```
