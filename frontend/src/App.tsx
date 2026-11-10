import { useCallback, useState } from 'react'
import { Scene } from './components/Scene'
import { Panel } from './components/Panel'
import { clientTools } from './clientTools'
import { useScene } from './store'
import { MACHINES, MACHINE_IDS } from './machines'
import { useVoiceAgent } from './voiceAgent'

const STATUS_LABEL: Record<string, string> = {
  listening: 'listening - just talk',
  thinking: 'thinking...',
  speaking: 'agent speaking',
  idle: 'paused',
}

export default function App() {
  const machine = useScene((s) => s.machine)
  const { status, sources, beginSession, endSession } = useVoiceAgent()
  const [sessionOn, setSessionOn] = useState(false)

  const start = useCallback(async () => {
    try {
      await beginSession()
      setSessionOn(true)
    } catch {
      // mic denied or intro failed - the panel already says so
    }
  }, [beginSession])

  const stop = useCallback(() => {
    endSession()
    setSessionOn(false)
    useScene.getState().reset()
  }, [endSession])

  // Manual switch, for when you want to set the stage before you start talking.
  // The agent can also do this itself via the switch_machine tool.
  const pickMachine = useCallback((id: string) => {
    clientTools.switch_machine({ machine: id })
  }, [])

  return (
    <div className="app">
      <header className="bar">
        <div className="brand">
          <span className="logo" />
          <div>
            <h1>Machinery</h1>
            <p>a voice agent that can see what you are looking at</p>
          </div>
        </div>

        <div className="machines">
          {MACHINE_IDS.map((id) => (
            <button
              key={id}
              className={`chip ${machine.id === id ? 'on' : ''}`}
              onClick={() => pickMachine(id)}
            >
              {MACHINES[id].name}
            </button>
          ))}
        </div>

        <div className="controls">
          <span
            className={`dot ${status === 'speaking' ? 'speaking' : sessionOn && status !== 'idle' ? 'live' : ''}`}
          />
          <span className="status">{sessionOn ? STATUS_LABEL[status] ?? status : 'session off'}</span>
          <button
            className={sessionOn && status !== 'idle' ? 'btn stop' : 'btn go'}
            onClick={sessionOn && status !== 'idle' ? stop : start}
          >
            {sessionOn && status !== 'idle' ? 'End session' : sessionOn ? 'Resume' : 'Start session'}
          </button>
        </div>
      </header>

      <main className="main">
        <div className="viewport">
          <Scene />
          <div className="machine-name">
            <b>{machine.name}</b>
            <span>{machine.subtitle}</span>
          </div>
          <div className="hint">
            click Start session, wait for the intro, then just talk &middot; drag to orbit &middot;
            hover a part and ask &ldquo;what is this?&rdquo;
          </div>
        </div>
        <Panel sources={sources} />
      </main>
    </div>
  )
}
