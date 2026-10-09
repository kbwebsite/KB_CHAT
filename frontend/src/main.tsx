import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// Bootstrap grid only (no Reboot): responsive multi-device shell for the
// desktop chat layout. Imported BEFORE index.css so the app's own design
// tokens win any ties and the mobile view stays pixel-identical.
import 'bootstrap/dist/css/bootstrap-grid.min.css'
import './index.css'
import { registerAppSW } from './utils/pwa'

// App-shell worker makes repeat loads instant and keeps installed tabs
// openable offline. Production only: in dev it would cache unhashed modules.
if (import.meta.env.PROD) {
  registerAppSW()
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
