# 栅格入格（影像 / 高程）设计 · 一期 B

日期：2026-07-31  
范围：**仅 B**（chip + 上图）；不做 3D 高程码 / 拉伸（C）。

## 目标

桌面端导入 GeoTIFF（正射 / DEM），按 GeoSOT 层级入格：

- 每格一条 `GridCellRecord`（`ref.kind=raster` + `fragment.kind=raster` + 统计 attrs）
- 每格裁 PNG chip，落在 `userData/chips/{source}/`
- 详情「上图」贴 chip 到格 bbox

浏览器暂不支持栅格导入。

## 流程

1. 选 `.tif/.tiff` → 主进程 probe（bbox、波段、像元尺度、建议 level、预估格数）
2. 用户确认 level（L8–L16）→ 主进程 `coverBBox` + 采样统计 + 写 chip → 写入 SqliteWarehouse
3. 渲染进程同步图层；选格后可上图

## 约束

- 单次入格格数上限：**4000**（超出提示改粗）
- chip 边长：**64 px**
- 假定 GeoTIFF 为地理坐标（WGS84）；和静样例满足
- 单波段 → `modality=dem`（zMin/zMax/zMean）；多波段 → `ortho`（bands）

## 关键接口

- `desktop:probeRaster(filePath)`
- `desktop:ingestRaster({ filePath, level, source, label })`
- `desktop:readChipDataUrl(chipUri)`
- `pickImportFile` 扩展返回 `kind: "geojson" | "raster"`
