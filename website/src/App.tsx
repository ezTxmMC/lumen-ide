import { Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { Download } from './pages/Download'
import { NotFound } from './pages/NotFound'

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="download" element={<Download />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
