# @dggs/grid-store

可插拔网格数据仓：保管 `GridCellRecord`，引擎可换。

```text
ingest 产行  →  store.put  →  getByCell / list / …
```

## API

| 成员 | 说明 |
|------|------|
| `GridWarehouse` | 引擎契约 |
| `MemoryWarehouse` | 内存（Demo / 测试） |
| `JsonFileWarehouse` | JSON 落盘（Node，`@dggs/grid-store/node`） |
| `SqliteWarehouse` | SQLite 落盘（Electron / Node，`@dggs/grid-store/node`；原生模块需与运行时 ABI 匹配） |

桌面 Demo 默认通过 Electron 主进程使用 `SqliteWarehouse`。本地 Node 上跑 SQLite 单测：

```bash
pnpm test:store:sqlite   # 使用 ELECTRON_RUN_AS_NODE（better-sqlite3 ABI）
```


```ts
import { MemoryWarehouse } from "@dggs/grid-store"
import { ingestPoint } from "@dggs/grid-ingest"

const store = new MemoryWarehouse()
await store.put([ingestPoint({ lon: 116.4, lat: 39.9, level: 12, source: "recon" })])
const rows = await store.getByCell(someCode)
```

换引擎时只改构造，不改业务查询代码。Postgres 等后续按同一接口加适配器即可。
