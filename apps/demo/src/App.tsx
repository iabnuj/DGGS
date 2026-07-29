import { LeftDrawer } from "@/components/shell/LeftDrawer"
import { RightPanel } from "@/components/shell/RightPanel"
import { StatusBar } from "@/components/shell/StatusBar"
import { MapCornerTools } from "@/components/shell/MapCornerTools"
import { PanelToggles } from "@/components/shell/PanelToggles"
import { useCesiumMap } from "@/map/useCesiumMap"

export function App() {
  useCesiumMap()

  return (
    <div className="relative h-full w-full">
      <div id="cesiumContainer" />
      <LeftDrawer />
      <RightPanel />
      <PanelToggles />
      <MapCornerTools />
      <StatusBar />
    </div>
  )
}
