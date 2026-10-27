import { HousekeepingApp } from './modules/housekeeping/index.js'

// Each HOSIS subsystem lives in src/modules/<subsystem>.
// Only the Housekeeping module is built so far.
function App() {
  return <HousekeepingApp />
}

export default App
