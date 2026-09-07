import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// Bootstrap grid only (no Reboot): responsive multi-device shell for the
// desktop chat layout. Imported BEFORE index.css so the app's own design
// tokens win any ties and the mobile view stays pixel-identical.
import 'bootstrap/dist/css/bootstrap-grid.min.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
