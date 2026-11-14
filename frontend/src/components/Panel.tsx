import { useEffect, useState } from 'react'
import { apiUrl } from '../api'
import { useScene } from '../store'
import { partById } from '../machines'
import type { WebSource } from '../voiceAgent'

interface CartLine {
  order_id: string; part_id: string; name: string; sku: string
  qty: number; price_inr: number; eta_days: number
}
interface SessionState {
  session_id: string
  cart: CartLine[]
  cart_total_inr: number
  log: { ts: number; kind: string; detail: string }[]
  procedure_title: string | null
  report: any | null
}

/** The compact domain, e.g. "https://www.creality.com/x" -> "creality.com". */
function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Pulls a currency amount out of a snippet/title so the card can show a price pill. */
function priceIn(s: string | undefined): string | null {
  if (!s) return null
  const m = s.match(/[₹$£€]\s?[\d][\d,.]*(?:\s?(?:k|K|cr|Cr|lakh|L))?|Rs\.?\s?[\d][\d,.]*|INR\s?[\d][\d,.]*/i)
  return m ? m[0].replace(/\s+/g, ' ').trim() : null
}

/** Polls the backend so anything the agent does via SERVER tools shows up too. */
export function Panel({ sources }: { sources?: WebSource[] }) {
  const [s, setS] = useState<SessionState | null>(null)
  const step = useScene((x) => x.step)
  const transcript = useScene((x) => x.transcript)
  const pointer = useScene((x) => x.pointerPart)
  const machine = useScene((x) => x.machine)

  useEffect(() => {
    let alive = true
    const tick = async () => {
      try {
        const r = await fetch(apiUrl('/api/session'))
        if (r.ok && alive) setS(await r.json())
      } catch { /* backend not up yet */ }
    }
    tick()
    const h = setInterval(tick, 1200)
    return () => { alive = false; clearInterval(h) }
  }, [])

  return (
    <aside className="panel">
      {s?.procedure_title && (
        <div className="proc">
          <span className="tag">PROCEDURE</span>
          {s.procedure_title}
        </div>
      )}

      {step && (
        <div className="step">
          <div className="step-head">
            STEP {step.n}{step.total ? ` / ${step.total}` : ''}
          </div>
          <p className="step-body">{step.instruction}</p>
          {step.tool && <div className="step-meta"><b>Tool</b> {step.tool}</div>}
          {step.check && <div className="step-meta"><b>Done when</b> {step.check}</div>}
        </div>
      )}

      {pointer && (
        <div className="pointer">
          pointing at <b>{partById(machine, pointer)?.label}</b> &mdash; try saying &ldquo;what is this?&rdquo;
        </div>
      )}

      {s && s.cart.length > 0 && (
        <div className="cart">
          <div className="section-head">PARTS ORDERED</div>
          {s.cart.map((c) => (
            <div key={c.order_id} className="cart-line">
              <span>{c.qty} x {c.name}</span>
              <span className="muted">Rs {c.price_inr} &middot; {c.eta_days}d</span>
            </div>
          ))}
          <div className="cart-total">Total Rs {s.cart_total_inr}</div>
        </div>
      )}

      {s?.report && (
        <div className="report">
          <div className="section-head">SERVICE RECORD {s.report.session_id}</div>
          <div className="report-row"><b>Root cause</b><span>{s.report.root_cause || '-'}</span></div>
          <div className="report-row"><b>Outcome</b><span>{s.report.outcome}</span></div>
          <div className="report-row"><b>Summary</b><span>{s.report.summary}</span></div>
        </div>
      )}

      {sources && sources.length > 0 && (
        <div className="web">
          <div className="web-head">
            <span className="web-flash" /> LIVE WEB
            <span className="web-sponsor">via OpenRouter</span>
            <span className="web-count">{sources.length}</span>
          </div>
          <div className="web-cards">
            {sources.slice(-4).map((src, i) => {
              const price = priceIn(src.snippet || src.title)
              return (
                <a
                  key={i}
                  className="web-card"
                  href={src.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="web-num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="web-body">
                    <span className="web-title">{src.title || src.url}</span>
                    <span className="web-meta">
                      <span className="web-domain">{domainOf(src.url)}</span>
                      {price && <span className="web-price">{price}</span>}
                    </span>
                    {src.snippet && <span className="web-snip">{src.snippet}</span>}
                  </span>
                  <span className="web-arrow">↗</span>
                </a>
              )
            })}
          </div>
        </div>
      )}

      <div className="section-head">LIVE</div>
      <div className="transcript">
        {transcript.slice(-14).map((l, i) => (
          <div key={i} className={`line ${l.role}`}>
            <span className="role">{l.role === 'tool' ? '>>' : l.role === 'agent' ? 'AGENT' : 'YOU'}</span>
            {l.text}
          </div>
        ))}
        {transcript.length === 0 && (
          <div className="line muted">Start the session and describe the fault.</div>
        )}
      </div>
    </aside>
  )
}
