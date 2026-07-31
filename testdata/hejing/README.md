# 新疆和静县桌面端测试数据

## 范围说明

| 范围 | west,south,east,north | 用途 |
|------|------------------------|------|
| 全县（参考） | `82.467,42.083,87.541,43.568` | 过大（约 3.4 万 km²），不整县下载 |
| **测试 AOI（默认）** | `86.30,42.24,86.50,42.38` | 和静镇县城周边，约 16×15 km |

中心约：`86.398°E, 42.313°N`（和静镇）。

## 目录

```text
testdata/hejing/
  meta.json
  vector/
    roads.geojson / buildings.geojson / pois.geojson
    shp/{roads,buildings,pois}/*.shp
  raster/
    dem_glo30.tif
    ortho_s2_rgb.tif
    ortho_s2_meta.json
  scripts/
    fetch_osm.py
    fetch_rasters.py
```

## 1. 矢量（OSM → GeoJSON / SHP）

默认走本机 **Privoxy** 代理 `http://127.0.0.1:1087`。优先用 OSM API `map?bbox=` 导出（小范围稳），失败再回退 Overpass。

```bash
cd testdata/hejing
python3 scripts/fetch_osm.py              # 全部图层
python3 scripts/fetch_osm.py pois         # 只更新某一层
DGGS_PROXY= python3 scripts/fetch_osm.py  # 关闭代理
```

依赖：本机 `ogr2ogr`（GDAL）用于写 Shapefile；没有 GDAL 时仍会写出 `.geojson`。

当前 demo 数据 Tab 可直接导入 `vector/*.geojson`。

许可：OpenStreetMap © ODbL。

## 2. 高程 + 影像（自动下载）

同样默认走 `http://127.0.0.1:1087`。

```bash
cd testdata/hejing
python3 scripts/fetch_rasters.py           # DEM + Sentinel-2
python3 scripts/fetch_rasters.py dem       # 仅高程 GLO-30
python3 scripts/fetch_rasters.py ortho     # 仅影像 S2 visual
```

产出：

- `raster/dem_glo30.tif` — Copernicus GLO-30，裁到 AOI  
- `raster/ortho_s2_rgb.tif` — Sentinel-2 L2A 真彩色，裁到 AOI  
- `raster/ortho_s2_meta.json` — 景 ID / 云量 / 时间  

依赖：本机 `gdalwarp`（已有 GDAL 即可）。原始瓦片缓存在 `raster/_raw/`。

## 3. 与 demo 的衔接

- **矢量**：`vector/*.geojson` 或 `vector/shp/*/*.shp` → 桌面「格网数据」导入（SHP 需同目录 .dbf/.shx）  
- **栅格**：`raster/dem_glo30.tif`、`ortho_s2_rgb.tif` → 同入口选 GeoTIFF；入格后带 PNG chip，详情可上图

若要把 AOI 换成其它范围，改 `meta.json` 的 `aoi` 后重新跑：

```bash
python3 scripts/fetch_osm.py
python3 scripts/fetch_rasters.py
```
