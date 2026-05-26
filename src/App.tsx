import { usePdfStore } from './stores/usePdfStore'
import { HomePage } from './pages/HomePage'
import { ListPage } from './pages/ListPage'
import { ScrollViewer } from './pages/ScrollViewer'
import { LocalBadge } from './components/LocalBadge'
import { RestorePrompt } from './components/modals/RestorePrompt'
import { UnloadWarning } from './components/UnloadWarning'
import { UpdatePrompt } from './components/UpdatePrompt'

export default function App() {
  const pageCount = usePdfStore((s) => s.pageCount)
  const appView = usePdfStore((s) => s.appView)

  const content = (() => {
    if (pageCount === 0) return <HomePage />
    if (appView === 'list') return <ListPage />
    return <ScrollViewer />
  })()

  return (
    <>
      {content}
      <LocalBadge />
      <RestorePrompt />
      <UnloadWarning />
      <UpdatePrompt />
    </>
  )
}
