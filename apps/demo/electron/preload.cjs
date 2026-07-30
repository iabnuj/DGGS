const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("dggsDesktop", {
  isDesktop: true,
  warehouse: {
    put: (records) => ipcRenderer.invoke("warehouse:put", records),
    getByCell: (gridId, opts) =>
      ipcRenderer.invoke("warehouse:getByCell", gridId, opts),
    getByPrefix: (prefix, opts) =>
      ipcRenderer.invoke("warehouse:getByPrefix", prefix, opts),
    list: (opts) => ipcRenderer.invoke("warehouse:list", opts),
    delete: (records) => ipcRenderer.invoke("warehouse:delete", records),
    clear: () => ipcRenderer.invoke("warehouse:clear"),
  },
  openJson: () => ipcRenderer.invoke("desktop:openJson"),
  saveJson: () => ipcRenderer.invoke("desktop:saveJson"),
  pickImportFile: () => ipcRenderer.invoke("desktop:pickImportFile"),
  probeRaster: (filePath) =>
    ipcRenderer.invoke("desktop:probeRaster", filePath),
  ingestRaster: (payload) =>
    ipcRenderer.invoke("desktop:ingestRaster", payload),
  readChipDataUrl: (chipUri) =>
    ipcRenderer.invoke("desktop:readChipDataUrl", chipUri),
  getSampleDataDir: () => ipcRenderer.invoke("desktop:getSampleDataDir"),
  confirm: (payload) => ipcRenderer.invoke("desktop:confirm", payload),
  onDataChanged: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on("desktop:dataChanged", listener)
    return () => ipcRenderer.removeListener("desktop:dataChanged", listener)
  },
  onImportProgress: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on("desktop:importProgress", listener)
    return () =>
      ipcRenderer.removeListener("desktop:importProgress", listener)
  },
})
