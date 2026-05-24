import { usePdfStore } from './stores/usePdfStore'
import { HomePage } from './pages/HomePage'
import { ListPage } from './pages/ListPage'
import { ScrollViewer } from './pages/ScrollViewer'
import { LocalBadge } from './components/LocalBadge'

export default function App() {
  const pageCount = usePdfStore((s) => s.pageCount)
  const appView = usePdfStore((s) => s.appView)

  if (pageCount === 0) return (
    <>
      <HomePage />
      <LocalBadge />
    </>
  )

  if (appView === 'list') return (
    <>
      <ListPage />
      <LocalBadge />
    </>
  )

  // デフォルト: 縦スクロール閲覧画面（viewer）
  return (
    <>
      <ScrollViewer />
      <LocalBadge />
    </>
  )
}
