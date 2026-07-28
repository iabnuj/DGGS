# grid-core 设计说明

**日期：** 2026-07-27  
**状态：** 已确认（用户「开干」）

## 目标

将 [catnuko/geosot](https://github.com/catnuko/geosot) 源码吸收为 DGGS 项目唯一编码库 `packages/grid-core` 的初始代码，在此基础上迭代，服务数字战场汇报型 Demo。

## 决策

- **吸收，不 vendoring**：不保留与上游的长期同步关系；代码归本仓库演进。
- **单包**：`packages/grid-core` 同时承载 encode/decode 与后续码代数。
- **许可**：保留 MIT，并在 NOTICE 中注明源自 catnuko/geosot（及 dadream/geosot 一脉）。
- **边界声明**：非正式 GJB 8896 / GB/T 39409 合规认证实现；初期对齐 GeoSOT / GB/T 40087 一脉公开算法。

## 目录

```text
DGGS/
  docs/
  packages/grid-core/
    src/
    test/
    package.json    # @dggs/grid-core
    LICENSE / NOTICE / README.md
```

## 迭代优先级（一期）

1. 跑通原有正反算测试 ✅  
2. 增加 parent / children / neighbors / aggregate / coverBBox ✅  
3. 金样例与往返测试 ✅  
4. Demo 接入（Cesium）✅ 基线 — `apps/demo`

实现计划：`docs/superpowers/plans/2026-07-27-grid-core-algebra.md`

## 非目标（本期）

- 北斗网格位置码（39409）完整格式  
- 线/面覆盖、栅格重采样  
- 宣称军标合规
