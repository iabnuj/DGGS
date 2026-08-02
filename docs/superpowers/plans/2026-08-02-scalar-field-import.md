# 标量场常规格式导入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 去掉自动加载，支持 CSV / 单波段 GeoTIFF 导入标量场，并提供公开常规格式样本。

**Architecture:** CSV 解析与入格在 `@dggs/grid-ingest`；DataTab / Electron 扩展文件过滤器；DEM 入格补 `field_value`；样本由 Open-Meteo 拉取 CSV，高程复用已有 GeoTIFF。

**Tech Stack:** TypeScript, Open-Meteo Archive API, GeoTIFF (Electron), Zustand store fieldSources

## Global Constraints

- 不自动在 boot 时入库场数据
- CSV 为 WGS84 经纬度
- 图层有 `field_value` 时类型为 `field`

---

## Task 1: 样本数据

- [ ] 脚本拉取和静测区气象 CSV
- [ ] README 说明路径与来源；链到 dem GeoTIFF
- [ ] 移除或停用 `public/fields/*.json` 自动加载依赖

## Task 2: ingest CSV

- [ ] `packages/grid-ingest/src/ingestFieldCsv.ts`：解析 + 同格均值 + `ingestFieldRecords`
- [ ] 导出；必要时小测

## Task 3: Demo 接线

- [ ] 去掉 `warehouseBoot` 自动加载
- [ ] DataTab 支持 `.csv`；Electron `pickImportFile` 加 csv
- [ ] `rasterIngest` 写 `field_value`；`layersFromRecords` 优先 field

## Task 4: 验证

- [ ] 导入 temperature.csv 可见标量场图层与色斑
- [ ] 启动不再自动出现 9 个场图层
