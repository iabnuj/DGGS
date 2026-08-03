# 多元数据语义表征（方案 A）设计

> 对齐 `docs/xq.md` 模块（2）：语义特征向量、区域要素识别、场地白模（格网挤出 + 外部模型）。

## 目标

在现有 GeoSOT 入格与仓之上，交付可演示闭环：

1. **统一语义向量**：多源（影像 chip / 矢量属性 / 文本查询）映射到同维向量，按 `grid_id` 时空对齐。
2. **区域要素识别**：规则 + 轻量相似，将机场/道路/建筑等类别赋到格并编码入库。
3. **场地白模**：① 语义/建筑类格挤出白模；③ 本地 glTF（及 URL 3D Tiles）外部模型叠加。

## 非目标（本期）

- 训练服务、GPU/ONNX CLIP 运行时（预留 Encoder 接口可替换）
- SAR/视频/传感器实时编码
- 生产级 ANN 索引
- 从影像自动重建精细 mesh 白模

## 架构

```
chip RGBA / 矢量 attrs / 文本
        │
        ▼
@dggs/grid-semantic  (embed / cosine / label / search)
        │
        ▼
GridCellRecord  source=semantic:*  attrs={class,score,embedding,model}
        │
        ▼
SemanticTab → 检索命中 → analysisResults 上色
WhiteModelLayer → 格挤出白模
ExternalModelLayer → glTF / 3D Tiles
```

## 数据约定

- `source`: `semantic:<originSource>`（如 `semantic:roads.geojson`）
- `attrs.class`: 类别字符串（`road` | `building` | `airport` | `target` | `water` | `other`）
- `attrs.score`: 0–1
- `attrs.embedding`: JSON 字符串化的 `number[]`（因 attrs 值类型不含数组）
- `attrs.model`: 特征模型 id，默认 `hist-v1`
- `featureId`: 类别或原 objectId

## UI

- 左侧 Accordion「语义表征」→ `SemanticTab`
  - 从已有图层生成语义记录
  - 文本检索 / 以选中格为 query
  - 白模：按类挤出开关；加载 glTF 文件或 3D Tiles URL
- 右侧详情：展示 `class` / `score`；一键近邻检索

## 白模

1. **格网挤出**：对 `attrs.class ∈ {building, airport, …}` 或指定 source 的格，用 cell bbox 挤出半透明白模。
2. **外部模型**：`Model.fromGltfAsync` 加载用户选择的 `.glb/.gltf`；可选 Ion/URL 的 `Cesium3DTileset`。

## 测试

- `grid-semantic`：cosine、normalize、hist embed 确定性、search top-K、labelFromSource 映射。
- Demo：手工验收检索上色与白模显隐。
