import { createRoot } from "react-dom/client"
import { App } from "./App"
import "./index.css"

const el = document.getElementById("root")
if (!el) throw new Error("#root missing")

// Cesium Viewer 不宜放 StrictMode 双挂载；否则异步 refresh 会打到已 destroy 的实例。
createRoot(el).render(<App />)
