import { app, BrowserWindow, Menu, dialog, ipcMain } from "electron"
import path from "node:path"
import { fileURLToPath } from "node:url"
import fs from "node:fs/promises"
import { existsSync, appendFileSync } from "node:fs"
import { createRequire } from "node:module"
import {
  ingestRasterFile,
  probeRaster,
  resolveChipPath,
} from "./rasterIngest.mjs"
import {
  shapefileDisplayName,
  shapefileToGeoJson,
} from "./shapefileToGeoJson.mjs"

// 浮动叠加滚动条（不占布局宽度）；须在 ready 之前
app.commandLine.appendSwitch(
  "enable-features",
  "OverlayScrollbar,OverlayScrollbarFlashAfterAnyScrollUpdate,OverlayScrollbarFlashWhenMouseEnter"
)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const isDev = !app.isPackaged

app.setName("格网编码系统")

const logPath = path.join(app.getPath("userData"), "dggs-main.log")

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.map(String).join(" ")}\n`
  try {
    appendFileSync(logPath, line)
  } catch {
    /* ignore */
  }
  console.log(...args)
}

/**
 * Bundled sample data directory (packaged via electron-builder extraResources).
 * Dev: apps/demo/resources/sample-data
 * Prod: <Resources>/sample-data
 */
function getSampleDataDir() {
  if (isDev) {
    return path.resolve(__dirname, "../resources/sample-data")
  }
  return path.join(process.resourcesPath, "sample-data")
}

/** Prefer hejing/ if present; otherwise sample-data root. */
function getImportDefaultPath() {
  const root = getSampleDataDir()
  const hejing = path.join(root, "hejing")
  if (existsSync(hejing)) return hejing
  if (existsSync(root)) return root
  return undefined
}

function getAppIconPath() {
  const p = path.join(__dirname, "../build/icon.png")
  return existsSync(p) ? p : undefined
}

/** @type {import('@dggs/grid-store/node').SqliteWarehouse | null} */
let warehouse = null
/** @type {BrowserWindow | null} */
let mainWindow = null

async function loadSqliteWarehouse() {
  const storeNode = isDev
    ? path.resolve(__dirname, "../../../packages/grid-store/dist/node.cjs")
    : path.join(__dirname, "vendor", "grid-store-node.cjs")

  const mod = require(storeNode)
  return mod.SqliteWarehouse
}

async function ensureWarehouse() {
  if (warehouse) return warehouse
  await migrateLegacyUserDataIfNeeded()
  const SqliteWarehouse = await loadSqliteWarehouse()
  const dbPath = path.join(app.getPath("userData"), "dggs-demo.sqlite")
  warehouse = new SqliteWarehouse(dbPath)
  return warehouse
}

/**
 * 产品更名后 Electron userData 目录会变（格网引擎 → 格网编码系统）。
 * 若新目录库为空且旧目录仍有数据，则一次性拷贝过来，避免“数据丢了”的错觉。
 */
async function migrateLegacyUserDataIfNeeded() {
  const userData = app.getPath("userData")
  const newDb = path.join(userData, "dggs-demo.sqlite")
  const legacyRoots = [
    path.join(app.getPath("appData"), "格网引擎"),
    path.join(app.getPath("appData"), "DGGS Demo"),
  ]

  let newSize = 0
  try {
    newSize = (await fs.stat(newDb)).size
  } catch {
    newSize = 0
  }
  // 空库或几乎空（仅 SQLite 头）
  if (newSize > 64_000) return

  for (const root of legacyRoots) {
    const oldDb = path.join(root, "dggs-demo.sqlite")
    try {
      const st = await fs.stat(oldDb)
      if (st.size <= newSize) continue
      await fs.mkdir(userData, { recursive: true })
      await fs.copyFile(oldDb, newDb)
      for (const ext of ["-wal", "-shm"]) {
        try {
          await fs.copyFile(oldDb + ext, newDb + ext)
        } catch {
          /* optional */
        }
      }
      // chips 目录（栅格切片）
      const oldChips = path.join(root, "chips")
      const newChips = path.join(userData, "chips")
      try {
        await fs.access(oldChips)
        if (!existsSync(newChips)) {
          await fs.cp(oldChips, newChips, { recursive: true })
        }
      } catch {
        /* no chips */
      }
      log("[dggs] migrated warehouse from", oldDb, "→", newDb)
      return
    } catch {
      /* try next legacy root */
    }
  }
}

function sendToRenderer(channel, payload) {
  mainWindow?.webContents.send(channel, payload)
}

function createMenu() {
  const template = [
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "文件",
      submenu: [
        {
          label: "打开 JSON…",
          accelerator: "CmdOrCtrl+O",
          click: () => void handleOpenJson(),
        },
        {
          label: "保存 JSON…",
          accelerator: "CmdOrCtrl+S",
          click: () => void handleSaveJson(),
        },
        { type: "separator" },
        process.platform === "darwin" ? { role: "close" } : { role: "quit" },
      ],
    },
    // Electron 必须挂编辑菜单 role，选中文本后的复制/粘贴快捷键才会生效
    {
      label: "编辑",
      submenu: [
        { role: "undo", label: "撤销" },
        { role: "redo", label: "重做" },
        { type: "separator" },
        { role: "cut", label: "剪切", accelerator: "CmdOrCtrl+X" },
        { role: "copy", label: "复制", accelerator: "CmdOrCtrl+C" },
        { role: "paste", label: "粘贴", accelerator: "CmdOrCtrl+V" },
        { role: "selectAll", label: "全选", accelerator: "CmdOrCtrl+A" },
      ],
    },
    {
      label: "帮助",
      submenu: [
        {
          label: "关于格网编码系统",
          click: () => {
            dialog.showMessageBox({
              type: "info",
              title: "关于",
              message: "格网编码系统",
              detail: `版本 ${app.getVersion()}\nGeoSOT + Cesium\n本地仓：SQLite\n样例数据：${getSampleDataDir()}`,
              icon: getAppIconPath(),
            })
          },
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/** 保证 Ctrl/⌘ + C/X/V/A 能作用于页面选区（含 macOS 上按 Ctrl 的习惯）。 */
function wireClipboardShortcuts(win) {
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return
    if (!(input.control || input.meta) || input.alt) return
    const key = input.key.toLowerCase()
    const wc = win.webContents
    if (key === "c") {
      wc.copy()
      event.preventDefault()
    } else if (key === "x") {
      wc.cut()
      event.preventDefault()
    } else if (key === "v") {
      wc.paste()
      event.preventDefault()
    } else if (key === "a") {
      wc.selectAll()
      event.preventDefault()
    }
  })

  win.webContents.on("context-menu", (_event, params) => {
    const items = []
    if (params.isEditable || params.selectionText) {
      if (params.isEditable) {
        items.push(
          { role: "cut", label: "剪切", enabled: params.editFlags.canCut },
          { role: "copy", label: "复制", enabled: params.editFlags.canCopy },
          { role: "paste", label: "粘贴", enabled: params.editFlags.canPaste },
          { type: "separator" },
          {
            role: "selectAll",
            label: "全选",
            enabled: params.editFlags.canSelectAll,
          }
        )
      } else if (params.selectionText) {
        items.push({
          label: "复制",
          click: () => win.webContents.copy(),
        })
      }
    }
    if (items.length === 0) return
    Menu.buildFromTemplate(items).popup({ window: win })
  })
}

async function handleOpenJson() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "打开网格数据 JSON",
    defaultPath: getImportDefaultPath(),
    filters: [{ name: "JSON", extensions: ["json", "geojson"] }],
    properties: ["openFile"],
  })
  if (result.canceled || !result.filePaths[0]) return
  try {
    const raw = await fs.readFile(result.filePaths[0], "utf8")
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      throw new Error("JSON 根节点必须是 GridCellRecord 数组")
    }
    const store = await ensureWarehouse()
    await store.clear()
    await store.put(parsed)
    sendToRenderer("desktop:dataChanged", { reason: "open" })
  } catch (err) {
    dialog.showErrorBox(
      "打开失败",
      err instanceof Error ? err.message : String(err)
    )
  }
}

async function handleSaveJson() {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "保存网格数据 JSON",
    defaultPath: "dggs-records.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
  })
  if (result.canceled || !result.filePath) return
  try {
    const store = await ensureWarehouse()
    const rows = await store.list()
    await fs.writeFile(result.filePath, JSON.stringify(rows, null, 2), "utf8")
  } catch (err) {
    dialog.showErrorBox(
      "保存失败",
      err instanceof Error ? err.message : String(err)
    )
  }
}

function registerIpc() {
  ipcMain.handle("warehouse:put", async (_e, records) => {
    const store = await ensureWarehouse()
    await store.put(records)
  })
  ipcMain.handle("warehouse:getByCell", async (_e, gridId, opts) => {
    const store = await ensureWarehouse()
    return store.getByCell(gridId, opts)
  })
  ipcMain.handle("warehouse:getByPrefix", async (_e, prefix, opts) => {
    const store = await ensureWarehouse()
    return store.getByPrefix(prefix, opts)
  })
  ipcMain.handle("warehouse:list", async (_e, opts) => {
    const store = await ensureWarehouse()
    return store.list(opts)
  })
  ipcMain.handle("warehouse:delete", async (_e, records) => {
    const store = await ensureWarehouse()
    if (store.delete) await store.delete(records)
  })
  ipcMain.handle("warehouse:clear", async () => {
    const store = await ensureWarehouse()
    if (store.clear) await store.clear()
  })
  ipcMain.handle("desktop:openJson", async () => {
    await handleOpenJson()
  })
  ipcMain.handle("desktop:saveJson", async () => {
    await handleSaveJson()
  })
  ipcMain.handle("desktop:pickImportFile", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "导入 GeoJSON / Shapefile / GeoTIFF / CSV",
      defaultPath: getImportDefaultPath(),
      filters: [
        {
          name: "支持的格式",
          extensions: ["geojson", "json", "shp", "zip", "tif", "tiff", "csv"],
        },
        { name: "GeoJSON / JSON", extensions: ["geojson", "json"] },
        { name: "Shapefile", extensions: ["shp", "zip"] },
        { name: "GeoTIFF", extensions: ["tif", "tiff"] },
        { name: "CSV 标量场", extensions: ["csv"] },
      ],
      properties: ["openFile"],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const filePath = result.filePaths[0]
    const name = path.basename(filePath)
    const ext = path.extname(filePath).toLowerCase()
    if (ext === ".tif" || ext === ".tiff") {
      return { kind: "raster", name, filePath }
    }
    if (ext === ".csv") {
      const text = await fs.readFile(filePath, "utf8")
      return { kind: "csv", name, text, filePath }
    }
    if (ext === ".shp" || ext === ".zip") {
      try {
        const { text, via } = await shapefileToGeoJson(filePath)
        return {
          kind: "geojson",
          name: shapefileDisplayName(filePath),
          text,
          filePath,
          fromShapefile: true,
          convertVia: via,
        }
      } catch (err) {
        dialog.showErrorBox(
          "Shapefile 导入失败",
          err instanceof Error ? err.message : String(err)
        )
        return null
      }
    }
    const text = await fs.readFile(filePath, "utf8")
    return { kind: "geojson", name, text, filePath }
  })
  ipcMain.handle("desktop:probeRaster", async (_e, filePath) => {
    return probeRaster({ filePath, isDev, dirname: __dirname })
  })
  ipcMain.handle("desktop:ingestRaster", async (_e, payload = {}) => {
    const { filePath, level, source, label } = payload
    if (!filePath || !source) throw new Error("缺少 filePath / source")
    const userDataDir = app.getPath("userData")
    const result = await ingestRasterFile({
      filePath,
      level,
      source,
      label,
      userDataDir,
      isDev,
      dirname: __dirname,
      onProgress: (p) => sendToRenderer("desktop:importProgress", { progress: p }),
    })
    const store = await ensureWarehouse()
    const prior = await store.list({ source })
    if (prior.length && store.delete) await store.delete(prior)
    await store.put(result.records)
    sendToRenderer("desktop:dataChanged", { reason: "raster-ingest" })
    return {
      count: result.count,
      source: result.source,
      level: result.level,
      modality: result.modality,
      firstGridId: result.records[0]?.gridId ?? null,
    }
  })
  ipcMain.handle("desktop:readChipDataUrl", async (_e, chipUri) => {
    const abs = resolveChipPath(app.getPath("userData"), chipUri)
    const buf = await fs.readFile(abs)
    return `data:image/png;base64,${buf.toString("base64")}`
  })
  ipcMain.handle("desktop:getSampleDataDir", async () => getSampleDataDir())
  ipcMain.handle(
    "desktop:confirm",
    async (_e, payload = {}) => {
      const {
        title = "确认",
        message = "确定继续？",
        detail = "",
        type = "warning",
      } = payload
      const result = await dialog.showMessageBox(mainWindow ?? undefined, {
        type,
        title,
        message,
        detail: detail || undefined,
        buttons: ["取消", "确定"],
        defaultId: 1,
        cancelId: 0,
        icon: getAppIconPath(),
      })
      return result.response === 1
    }
  )
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "格网编码系统",
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    void mainWindow.loadURL("http://127.0.0.1:5173")
    mainWindow.webContents.openDevTools({ mode: "detach" })
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"))
  }

  wireClipboardShortcuts(mainWindow)

  mainWindow.on("closed", () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  // Ensure store package is built in dev (caller should run build:store; soft-check)
  if (isDev) {
    const built = path.resolve(__dirname, "../../../packages/grid-store/dist/node.cjs")
    try {
      await fs.access(built)
    } catch {
      dialog.showErrorBox(
        "缺少构建产物",
        "请先在仓库根目录执行：pnpm build:store"
      )
      app.quit()
      return
    }
  }

  try {
    await ensureWarehouse()
    log("[dggs] SqliteWarehouse ready at", path.join(app.getPath("userData"), "dggs-demo.sqlite"))
    log("[dggs] sample data dir", getSampleDataDir())
  } catch (err) {
    log(
      "[dggs] warehouse init failed",
      err instanceof Error ? err.stack || err.message : String(err)
    )
    dialog.showErrorBox(
      "数据仓初始化失败",
      err instanceof Error ? err.message : String(err)
    )
  }

  registerIpc()
  createMenu()
  createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", () => {
  warehouse?.close?.()
  warehouse = null
  if (process.platform !== "darwin") app.quit()
})
