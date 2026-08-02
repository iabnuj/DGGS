# 标量场样本（常规格式 · 连续填满）

区域：和静测区约 42–43°N, 86–87°E

采样方式：对 bbox 做 **GeoSOT L12 cover**，取每格中心向 Open-Meteo 取值。  
导入时请选 **L12**，可得到与 cover 一致、无空洞的色斑。

| 文件 | 格式 | 含义 | 来源 |
|------|------|------|------|
| temperature.csv | CSV `lon,lat,value` | 2m 气温 (°C) | [Open-Meteo Archive](https://open-meteo.com/) / ERA5，2024-07-15 06:00 UTC |
| pressure.csv | CSV | 地表气压 (hPa) | 同上 |
| wind_speed.csv | CSV | 10m 风速 (km/h) | 同上 |
| elevation_dem_glo30.tif | GeoTIFF | 高程 | Copernicus DEM GLO-30（见 `../hejing/raster/dem_glo30.tif`） |

重新生成：

```bash
node scripts/fetch-field-samples.mjs
```

## 合成环境场（连续填满）

与上表同一 bbox / L12 cover。空间分布为平滑合成场，量级贴近常见业务区间。

| 文件 | 含义 | 值域 | 单位 |
|------|------|------|------|
| em_intensity.csv | 电磁场强度 | -90 ~ -30 | dBm |
| radar_coverage.csv | 雷达波覆盖 | -85 ~ 5 | dB |
| magnetic_field.csv | 磁场强度 | 47500 ~ 56500 | nT |

```bash
node scripts/gen-synthetic-fields.mjs
```
