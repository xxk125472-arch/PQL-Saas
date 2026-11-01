import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { AuthPage } from './auth/AuthPage'

// Route-level code splitting keeps the sign-in bundle small.
const Overview = lazy(() => import('./pages/Overview').then((m) => ({ default: m.Overview })))
const Customers = lazy(() => import('./pages/Customers').then((m) => ({ default: m.Customers })))
const DataCenter = lazy(() => import('./pages/DataCenter').then((m) => ({ default: m.DataCenter })))
const Analysis = lazy(() => import('./pages/Analysis').then((m) => ({ default: m.Analysis })))
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })))

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
      <Route path="/login" element={<AuthPage key="login" mode="login" />} />
      <Route path="/register" element={<AuthPage key="register" mode="register" />} />
      <Route element={<AppShell />}>
        <Route path="/overview" element={<Overview />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/data" element={<DataCenter />} />
        <Route path="/analysis" element={<Analysis />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="/" element={<Navigate to="/overview" replace />} />
      <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
    </Suspense>
  )
}
