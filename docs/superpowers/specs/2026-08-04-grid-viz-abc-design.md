# 网格化业务可视化（体对象 / 二维场 / 三维场）

**日期：** 2026-08-04  
**状态：** 已确认（用户要求按 A→B→C 全部实现）  
**对应需求：** `docs/xq.md` §(5) ①②③

## 目标

在现有 Demo 上补齐三类可视化闭环：

| 阶段 | 需求 | 交付 |
|------|------|------|
| A | 体对象：建筑物等以剖分立方格显示 | 数据层一键「体对象白模」；按 height/attrs 挤出 |
| B | 二维球面场：地形等 | 场色斑 + 图例；DEM/高程场默认 terrain 色带 |
| C | 三维球体场：温度/风速等 | 立体体素（多层挤出着色）按 field_value |

## 非目标

- 正式军标合规认证
- 全量全球三维场实时渲染（单图层上限约数千体素）
- 独立白模编辑器

## A — 体对象

- 入口：格网数据项操作区增加「体对象」按钮（vector / 非语义层）
- 数据：该 source 全部 gridId；高度取 `attrs.height` / `attrs.building_height` / `attrs.H`，缺省 24m
- 渲染：复用并增强 `WhiteModelLayer`（支持 per-code 高度）
- 清除：再点一次或「清除体对象」

## B — 二维球面场

- 已有：fieldSources + 色斑 + FieldStylePopover
- 增强：
  - dem / 含 elev|dem|height|terrain 的 source 默认 `terrain` 色带
  - 地图角或右侧增加简易场图例（当前可见场的 min–max + 色带条）
  - 地图显示说明：Cesium 地形开关与「格网高程场」区分

## C — 三维球体场

- 新层 `VolumeFieldLayer`：对选中 field source，按格 bbox 挤出若干高度切片（默认 8 层，总高度可配），颜色由 field_value 映射
- 入口：标量场图层旁「立体场」按钮；与平面色斑可并存
- 上限：约 2000 格 × 层数，超出抽样

## 验收

1. 导入 buildings → 点体对象 → 见半透明立方格堆
2. 导入 DEM/CSV 场 → 见色斑 + 图例
3. 对风速/温度场点立体场 → 见多层着色体素
