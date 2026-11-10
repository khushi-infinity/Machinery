import React, { Suspense, lazy, useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// The labelling studio is a separate tool, not part of the demo surface, so it
// is code-split and lives behind #label. No router dependency.
const Labeller = lazy(() => import('./label/Labeller'))

function Root() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const h = () => setHash(window.location.hash)
    window.addEventListener('hashchange', h)
    return () => window.removeEventListener('hashchange', h)
  }, [])

  if (hash === '#label') {
    return (
      <Suspense fallback={<div className="loading" style={{ padding: 40 }}>loading studio…</div>}>
        <Labeller />
      </Suspense>
    )
  }
  return <App />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
