import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppCreatePage } from './features/apps/AppCreatePage'
import { AppDetailPage } from './features/apps/AppDetailPage'
import { AppListPage } from './features/apps/AppListPage'
import {
  AssetsLayoutPage,
  AssetsRulePage,
} from './features/assets/AssetBrowserPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { CanvasPreview } from './preview/CanvasPreview'
import { SidebarShell } from './shell/SidebarShell'
import { ConfirmTipHost } from './ui/ConfirmTipHost'

export function App() {
  return (
    <BrowserRouter>
      <SidebarShell>
        <Routes>
          <Route path="/" element={<AppListPage />} />
          <Route path="/apps/new" element={<AppCreatePage />} />
          <Route path="/apps/:id" element={<AppDetailPage />} />
          <Route
            path="/apps/:id/canvases/:canvasId"
            element={<CanvasPreview />}
          />
          <Route path="/assets/rule" element={<AssetsRulePage />} />
          <Route path="/assets/layout" element={<AssetsLayoutPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SidebarShell>
      <ConfirmTipHost />
    </BrowserRouter>
  )
}
