# 标量场常规格式导入设计

**日期：** 2026-08-02  
**状态：** 已确认（方案 A）

## 目标

- 取消启动时自动加载自定义 `{code,value}` JSON 场数据
- 通过 DataTab「导入」使用常规格式：CSV（`lon,lat,value`）与单波段 GeoTIFF
- 仓库提供可下载的公开样本，便于演示温度/气压/风速/高程等标量场色斑

## 行为

1. **启动**：只同步仓库已有图层，不预置场数据
2. **CSV**：浏览器与桌面均可选；解析经纬度与数值列 → GeoSOT 编码 → 同格取均值 → `attrs.field_value` → 图层类型 `field`
3. **单波段 GeoTIFF**（桌面）：入格时写入 `field_value`（格内均值，与现有 `zMean` 一致）→ 图层类型优先为 `field`，走色斑渲染；chip 仍可保留
4. **显隐**：场图层眼睛开关控制 `fieldSources`，不走矢量 dataOverlay
5. **样本**：`testdata/fields/` 存放 CSV + README；高程复用已有 `testdata/hejing/raster/dem_glo30.tif`

## CSV 约定

| 列 | 别名 |
|----|------|
| 经度 | `lon` / `longitude` / `lng` / `x` |
| 纬度 | `lat` / `latitude` / `y` |
| 数值 | `value`；否则首个非坐标数值列 |
| 可选 | `unit`、`time`、`name` |

## 非目标

- NetCDF 直接导入（后续可加）
- 自定义 GeoSOT JSON 场文件作为推荐格式（废弃自动加载）

## 风险

- 全局 gitignore 含 `data`，`apps/demo/src/data/` 下新文件需 `-f` 或迁出目录；场 CSV 解析放在 `packages/grid-ingest`
