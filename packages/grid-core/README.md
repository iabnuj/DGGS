# @dggs/grid-core

数字战场 DGGS 项目的网格编码核。

初始代码吸收自 [catnuko/geosot](https://github.com/catnuko/geosot)（MIT），将在本仓库内独立演进。  
**非正式** GJB 8896 / GB/T 39409 合规认证实现；当前能力对齐 GeoSOT 公开编解码算法（注释中曾标注 GB/T 40087 一脉）。

## 能力（基线）

### GeoSOT 2D

- 经纬度 → 二进制 / 四进制编码
- 行列号、角点、bbox
- 编码 ↔ id 互转

### GeoSOT-3D

- 经纬高 → 二进制三维码 / 一维码 / 八进制一维码
- 码制互转、沿轴移动、offset

## 开发

```bash
cd packages/grid-core
npm install
npm test
npm run build
```

## 已提供

| 模块 | API |
|------|-----|
| `algebra` | `parent` / `children` / `neighbors` / `aggregate` |
| `cover` | `coverBBox`, `coverPolygon` |

金样例与往返一致性见 `test/consistency.test.ts`。

详见：

- `docs/superpowers/specs/2026-07-27-grid-core-design.md`
- `docs/数字战场-DGGS领域梳理.md`
