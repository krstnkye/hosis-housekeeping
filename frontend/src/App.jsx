import { HousekeepingApp } from './modules/housekeeping/index.js'
import PublicLostFoundPage from './modules/housekeeping/pages/PublicLostFoundPage.jsx'

// Each HOSIS subsystem lives in src/modules/<subsystem>.
// Only the Housekeeping module is built so far.
function App() {
  const publicMatch = window.location.hash.match(/^#\/lost-found\/item\/([a-f0-9-]+)$/i)
  if (publicMatch) return <PublicLostFoundPage code={publicMatch[1]} />
  return <HousekeepingApp />
}

export default App
