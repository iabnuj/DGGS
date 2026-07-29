import { app, BrowserWindow, Menu, dialog, ipcMain } from "electron"
import path from "node:path"
import { fileURLToPath } from "node:url"
import fs from "node:fs/promises"
import { existsSync, appendFileSync } from "node:fs"
import { createRequire } from "node:module"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const isDev = !app.isPackaged

app.setName("DGGS Demo")

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
  const SqliteWarehouse = await loadSqliteWarehouse()
  const dbPath = path.join(app.getPath("userData"), "dggs-demo.sqlite")
  warehouse = new SqliteWarehouse(dbPath)
  return warehouse
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
    {
      label: "帮助",
      submenu: [
        {
          label: "关于 DGGS Demo",
          click: () => {
            dialog.showMessageBox({
              type: "info",
              title: "关于",
              message: "DGGS Demo",
              detail: `版本 ${app.getVersion()}\nGeoSOT + Cesium 桌面演示\n本地仓：SQLite\n样例数据：${getSampleDataDir()}`,
            })
          },
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
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
      title: "导入 GeoJSON / JSON",
      defaultPath: getImportDefaultPath(),
      filters: [
        { name: "GeoJSON / JSON", extensions: ["geojson", "json"] },
      ],
      properties: ["openFile"],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const filePath = result.filePaths[0]
    const text = await fs.readFile(filePath, "utf8")
    return { name: path.basename(filePath), text }
  })
  ipcMain.handle("desktop:getSampleDataDir", async () => getSampleDataDir())
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "DGGS Demo",
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
