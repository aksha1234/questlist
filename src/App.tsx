import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays, Check, ChevronRight, Circle, Clock3, Coffee, Edit3, Flame, Leaf, Pause,
  Music2, Play, Plus, RotateCcw, Sparkles, Trash2, Utensils, Volume2, WandSparkles
} from 'lucide-react'

type Task = { id: string; title: string; done: boolean; points: number; minutes: number; sessions: number }
type PlanSource = 'ai' | 'offline'
type Quest = { id: string; title: string; tasks: Task[]; createdAt: number; deadline?: string; availableMinutes?: number; planSource?: PlanSource }
type PlannedTask = { title: string; points: number; minutes: number }
type PlanRequest = { goal: string; availableMinutes: number; deadline?: string }
type PlannerProvider = { plan: (request: PlanRequest) => Promise<PlannedTask[]> }
type Ambience = 'none' | 'pad' | 'chimes'
type StoredState = { quests: Quest[]; points: number; claimedRewards: number[]; ambience: Ambience; volume: number }

const STORAGE_KEY = 'questlist-state-v1'
const FOCUS_MINUTES = 25
const REWARDS = [
  { points: 30, title: 'A proper coffee break', note: 'Step away and enjoy it slowly.', icon: Coffee },
  { points: 60, title: 'Dinner, your choice', note: 'Choose something you genuinely love.', icon: Utensils },
  { points: 100, title: 'A weekend outing', note: 'Plan a small adventure beyond the usual.', icon: Sparkles },
]

function steps(items: [string, number][]): PlannedTask[] {
  return items.map(([title, points]) => ({ title, points, minutes: points <= 5 ? 10 : points <= 10 ? 25 : 50 }))
}

function breakdown(goal: string): PlannedTask[] {
  const clean = goal.trim().replace(/[.!?]+$/, '')
  const lower = clean.toLowerCase()
  if (/learn|study|course|language|skill|exam|certif/.test(lower)) return steps([
    [`Write down the exact skill or result you want from “${clean}”`, 5], ['Choose one trusted course, book, or learning path', 10],
    ['Put three 25-minute practice sessions on your calendar', 5], ['Complete the first lesson and its practice exercise', 15],
    ['Test yourself without notes for ten minutes', 10], ['Review what was difficult and plan the next three sessions', 5]
  ])
  if (/trip|travel|vacation|holiday|weekend|day out|outing/.test(lower)) return steps([
    ['Choose the weekend dates and one thing you want to feel or experience', 5], ['Set a comfortable spending limit and travel radius', 5],
    ['Shortlist three realistic places or activities nearby', 10], ['Check the forecast, opening times, and travel details', 5],
    ['Choose one simple itinerary and invite anyone joining you', 10], ['Make any booking and pack the few essentials', 10]
  ])
  if (/event|party|wedding|celebration|dinner/.test(lower)) return steps([
    ['Set the date, guest count, budget, and atmosphere', 5], ['Choose and confirm the place', 15],
    ['Make the guest list and send invitations', 10], ['Plan food, drinks, and any supplies', 10],
    ['Confirm the final details two days beforehand', 5], ['Prepare a short day-of checklist', 5]
  ])
  if (/write|essay|report|book|blog|proposal|presentation/.test(lower)) return steps([
    ['Write one sentence describing the reader and main point', 5], ['Collect the three most useful references or facts', 10],
    ['Create a five-part rough outline', 5], ['Draft the first section without editing', 10],
    ['Complete the remaining first draft', 15], ['Edit for clarity, proofread, and share', 10]
  ])
  if (/clean|organize|declutter|tidy|garage|closet|room/.test(lower)) return steps([
    ['Choose one small, visible area and take a “before” photo', 5], ['Set out keep, donate, relocate, and rubbish containers', 5],
    ['Clear and sort one surface or section', 10], ['Return every kept item to a specific home', 10],
    ['Remove donations and rubbish from the room', 10], ['Do a ten-minute finishing reset', 5]
  ])
  if (/fitness|exercise|run|marathon|workout|health|lose weight/.test(lower)) return steps([
    ['Choose one measurable, realistic result and target date', 5], ['Pick a simple weekly routine that fits your current level', 10],
    ['Prepare clothes, equipment, and a backup indoor option', 5], ['Complete the first short session at an easy pace', 10],
    ['Schedule the next three sessions', 5], ['Review energy and difficulty after one week', 10]
  ])
  if (/job|career|resume|cv|interview|apply/.test(lower)) return steps([
    ['Define the role, location, and three must-have criteria', 5], ['Find five suitable openings or target organisations', 10],
    ['Update your résumé for the first role', 15], ['Write a tailored, concise application', 10],
    ['Submit the first application', 5], ['Prepare five interview stories and track follow-ups', 15]
  ])
  if (/build|create|launch|make|develop|website|app|business/.test(lower)) return steps([
    [`Describe the useful finished result of “${clean}” in one sentence`, 5], ['List only the features needed for a smallest useful version', 10],
    ['Gather the essential tools, examples, and materials', 5], ['Create the first usable piece or prototype', 15],
    ['Ask one person to try it and note where they struggle', 10], ['Fix the most important issue and share the first version', 15]
  ])
  return steps([
    [`Write a one-sentence finish line for “${clean}”`, 5], ['List what you need and remove anything non-essential', 5],
    ['Choose the smallest action that takes under 15 minutes', 5], ['Complete that first action', 10],
    ['Schedule one 25-minute session for the main work', 5], ['Review the result and write the next concrete action', 5]
  ])
}

// A provider boundary keeps offline planning reliable today and makes a validated
// server-backed provider replaceable later without changing the UI or stored plan shape.
const offlinePlanner: PlannerProvider = {
  plan: async ({ goal }) => breakdown(goal),
}

function isValidTask(task: unknown): task is PlannedTask {
  if (!task || typeof task !== 'object') return false
  const value = task as Record<string, unknown>
  return typeof value.title === 'string' && value.title.trim().length >= 3 && value.title.length <= 140
    && Number.isInteger(value.minutes) && Number(value.minutes) >= 5 && Number(value.minutes) <= 180
    && Number.isInteger(value.points) && Number(value.points) >= 5 && Number(value.points) <= 25
}

const aiPlanner: PlannerProvider = {
  async plan(request) {
    const response = await fetch('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    if (!response.ok) throw new Error('AI planner unavailable')
    const payload: unknown = await response.json()
    if (!payload || typeof payload !== 'object' || (payload as { source?: unknown }).source !== 'ai') throw new Error('Unexpected planner response')
    const tasks = (payload as { tasks?: unknown }).tasks
    if (!Array.isArray(tasks) || tasks.length < 4 || tasks.length > 12 || !tasks.every(isValidTask)) throw new Error('Invalid AI plan')
    return tasks
  },
}

async function createPlan(request: PlanRequest): Promise<{ tasks: Task[]; source: PlanSource }> {
  const sessionLength = Math.min(25, request.availableMinutes)
  let planned: PlannedTask[] = []
  let source: PlanSource = 'ai'
  try { planned = await aiPlanner.plan(request) } catch {
    source = 'offline'
    planned = await offlinePlanner.plan(request)
  }
  const valid = planned.filter(isValidTask)
  if (valid.length < 3) {
    source = 'offline'
    planned = breakdown(request.goal)
  }
  const resilientPlan = planned.filter(isValidTask)
  const tasks = resilientPlan.map(task => ({
    ...task,
    title: task.title.trim(),
    minutes: Math.max(5, Math.round(task.minutes / 5) * 5),
    points: Math.min(25, Math.max(5, Math.round(task.points / 5) * 5)),
    id: uid(),
    done: false,
    sessions: Math.max(1, Math.ceil(task.minutes / sessionLength)),
  }))
  return { tasks, source }
}

function loadState(): StoredState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      const saved = parsed.ambience
      const ambience: Ambience = saved === 'instrumental' ? 'pad' : saved === 'pad' || saved === 'chimes' ? saved : 'none'
      return { volume: .35, ...parsed, ambience }
    }
  } catch { /* start fresh if local storage is unavailable */ }
  return { quests: [], points: 0, claimedRewards: [], ambience: 'none', volume: .35 }
}

const uid = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`

export default function App() {
  const initial = useMemo(loadState, [])
  const [quests, setQuests] = useState(initial.quests)
  const [points, setPoints] = useState(initial.points)
  const [claimedRewards, setClaimedRewards] = useState(initial.claimedRewards)
  const [goal, setGoal] = useState('')
  const [availableMinutes, setAvailableMinutes] = useState(25)
  const [deadline, setDeadline] = useState('')
  const [recentQuestId, setRecentQuestId] = useState<string | null>(null)
  const [celebratingReward, setCelebratingReward] = useState<number | null>(null)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [planning, setPlanning] = useState(false)
  const [seconds, setSeconds] = useState(FOCUS_MINUTES * 60)
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerComplete, setTimerComplete] = useState(false)
  const [ambience, setAmbience] = useState<Ambience>(initial.ambience)
  const [volume, setVolume] = useState(initial.volume)
  const timerRef = useRef<number | null>(null)
  const sessionAwardedRef = useRef(false)
  const audioRef = useRef<{ context: AudioContext; gain: GainNode; nodes: AudioScheduledSourceNode[]; timers: number[] } | null>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ quests, points, claimedRewards, ambience, volume }))
  }, [quests, points, claimedRewards, ambience, volume])

  useEffect(() => { if (audioRef.current) audioRef.current.gain.gain.value = volume }, [volume])

  useEffect(() => () => stopAmbience(), [])

  useEffect(() => {
    if (!timerRunning) return
    timerRef.current = window.setInterval(() => {
      setSeconds(value => {
        if (value <= 1) {
          window.clearInterval(timerRef.current!)
          setTimerRunning(false)
          stopAmbience()
          setTimerComplete(true)
          if (!sessionAwardedRef.current) {
            sessionAwardedRef.current = true
            setPoints(p => p + 15)
          }
          return 0
        }
        return value - 1
      })
    }, 1000)
    return () => window.clearInterval(timerRef.current!)
  }, [timerRunning])

  const completed = quests.reduce((n, q) => n + q.tasks.filter(t => t.done).length, 0)
  const total = quests.reduce((n, q) => n + q.tasks.length, 0)
  const nextReward = REWARDS.find(r => r.points > points)
  const recentQuest = quests.find(quest => quest.id === recentQuestId)

  async function createQuest(e: FormEvent) {
    e.preventDefault()
    if (!goal.trim() || planning) return
    setPlanning(true)
    const request = { goal: goal.trim(), availableMinutes, deadline: deadline || undefined }
    try {
      const { tasks, source } = await createPlan(request)
      const questId = uid()
      setQuests(q => [{ id: questId, title: request.goal, tasks, createdAt: Date.now(), deadline: request.deadline, availableMinutes, planSource: source }, ...q])
      setRecentQuestId(questId)
      setGoal('')
      setDeadline('')
      window.setTimeout(() => document.getElementById('quests')?.scrollIntoView({ behavior: 'smooth' }), 50)
    } finally { setPlanning(false) }
  }

  function toggleTask(questId: string, taskId: string) {
    const task = quests.find(quest => quest.id === questId)?.tasks.find(item => item.id === taskId)
    if (!task) return
    setQuests(current => current.map(q => q.id !== questId ? q : {
      ...q, tasks: q.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t)
    }))
    setPoints(current => Math.max(0, current + (task.done ? -task.points : task.points)))
  }

  function updateTask(questId: string, taskId: string, title: string) {
    setQuests(current => current.map(q => q.id !== questId ? q : {
      ...q, tasks: q.tasks.map(t => t.id === taskId ? { ...t, title } : t)
    }))
  }

  function addTask(questId: string) {
    setQuests(current => current.map(q => q.id === questId
      ? { ...q, tasks: [...q.tasks, { id: uid(), title: 'A new step', done: false, points: 10, minutes: 25, sessions: 1 }] }
      : q))
  }

  function deleteQuest(quest: Quest) {
    if (!window.confirm(`Delete “${quest.title}”? Your earned points will stay.`)) return
    setQuests(current => current.filter(item => item.id !== quest.id))
    if (recentQuestId === quest.id) setRecentQuestId(null)
    setEditingTaskId(null)
  }

  function resetTimer() {
    stopAmbience()
    sessionAwardedRef.current = false
    setTimerRunning(false); setSeconds(FOCUS_MINUTES * 60); setTimerComplete(false)
  }

  function stopAmbience() {
    const audio = audioRef.current
    if (!audio) return
    audio.timers.forEach(timer => window.clearInterval(timer))
    audio.nodes.forEach(node => { try { node.stop() } catch { /* already stopped */ } })
    void audio.context.close()
    audioRef.current = null
  }

  function startAmbience() {
    if (ambience === 'none' || audioRef.current) return
    const AudioContextClass = window.AudioContext
    const context = new AudioContextClass()
    const gain = context.createGain()
    gain.gain.value = volume
    gain.connect(context.destination)
    const nodes: AudioScheduledSourceNode[] = []
    const timers: number[] = []
    if (ambience === 'pad') {
      const filter = context.createBiquadFilter()
      const toneGain = context.createGain()
      filter.type = 'lowpass'; filter.frequency.value = 850; filter.Q.value = .6
      toneGain.gain.value = .16
      filter.connect(toneGain).connect(gain)

      const lfo = context.createOscillator(); const lfoDepth = context.createGain()
      lfo.frequency.value = .08; lfoDepth.gain.value = .045
      lfo.connect(lfoDepth).connect(toneGain.gain); lfo.start(); nodes.push(lfo)

      const chord = [174.61, 220, 261.63, 329.63]
      chord.forEach((frequency, index) => {
        const oscillator = context.createOscillator(); const voiceGain = context.createGain()
        oscillator.type = index < 2 ? 'sine' : 'triangle'; oscillator.frequency.value = frequency; oscillator.detune.value = index % 2 ? -5 : 4
        voiceGain.gain.value = index === 0 ? .3 : .14
        oscillator.connect(voiceGain).connect(filter); oscillator.start(); nodes.push(oscillator)
      })
    } else {
      const notes = [523.25, 659.25, 783.99, 987.77]
      let noteIndex = 0
      const playChime = () => {
        const now = context.currentTime
        const oscillator = context.createOscillator(); const chimeGain = context.createGain()
        oscillator.type = 'sine'; oscillator.frequency.value = notes[noteIndex % notes.length]; noteIndex += 1
        chimeGain.gain.setValueAtTime(.0001, now); chimeGain.gain.exponentialRampToValueAtTime(.13, now + .04); chimeGain.gain.exponentialRampToValueAtTime(.0001, now + 2.8)
        oscillator.connect(chimeGain).connect(gain); oscillator.start(now); oscillator.stop(now + 3); nodes.push(oscillator)
      }
      playChime()
      timers.push(window.setInterval(playChime, 6500))
    }
    audioRef.current = { context, gain, nodes, timers }
  }

  function toggleTimer() {
    if (seconds === 0) { resetTimer(); return }
    if (timerRunning) { stopAmbience(); setTimerRunning(false) }
    else { sessionAwardedRef.current = false; startAmbience(); setTimerComplete(false); setTimerRunning(true) }
  }

  function claimReward(threshold: number) {
    setClaimedRewards(c => c.includes(threshold) ? c : [...c, threshold])
    setCelebratingReward(threshold)
    window.setTimeout(() => setCelebratingReward(current => current === threshold ? null : current), 2200)
  }

  const mins = Math.floor(seconds / 60).toString().padStart(2, '0')
  const secs = (seconds % 60).toString().padStart(2, '0')

  return (
    <div className="app-shell">
      {celebratingReward && <div className="firework-overlay" aria-hidden="true"><div className="celebration-glow"/>{['one','two','three','four'].map(name => <div className={`firework-burst burst-${name}`} key={name}>{Array.from({length:12},(_,i) => <i key={i}/>)}</div>)}</div>}
      <header className="topbar">
        <a className="brand" href="#top" aria-label="QuestList home"><span className="brand-mark"><Leaf size={18}/></span>QuestList</a>
        <nav aria-label="Page sections"><a href="#quests">My quests</a><a href="#focus">Focus</a></nav>
        <div className="points-pill"><Sparkles size={15}/><strong>{points}</strong> points</div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="eyebrow"><span/> A quieter way forward <span/></div>
          <h1>Turn big intentions into<br/><em>small, doable quests.</em></h1>
          <p>Choose a destination. We’ll help you find the next few steps—then stay beside you while you make them happen.</p>

          <form className="goal-card" onSubmit={createQuest}>
            <label htmlFor="goal"><WandSparkles size={17}/> What would you like to accomplish?</label>
            <input className="goal-input" id="goal" required value={goal} onChange={e => setGoal(e.target.value)} placeholder="e.g. Plan a weekend garden, learn conversational French…" />
            <div className="plan-options">
              <label><Clock3 size={15}/><span>Time available</span><select value={availableMinutes} onChange={e => setAvailableMinutes(Number(e.target.value))} aria-label="Time available per session"><option value="15">15 min at a time</option><option value="25">25 min at a time</option><option value="45">45 min at a time</option><option value="60">1 hour at a time</option></select></label>
              <label><CalendarDays size={15}/><span>Deadline <small>optional</small></span><input type="date" value={deadline} min={new Date().toISOString().slice(0,10)} onChange={e => setDeadline(e.target.value)}/></label>
              <button className="primary" type="submit" disabled={planning}>{planning ? <><span className="planning-spinner"/> Creating your plan…</> : <>Create my plan <ChevronRight size={18}/></>}</button>
            </div>
            <p className="privacy"><Leaf size={13}/> One click creates your complete plan. You can edit anything later.</p>
          </form>
        </section>

        <section className="content-section" id="quests">
          <div className="section-heading"><div><span className="kicker">Your path</span><h2>Active quests</h2></div>{total > 0 && <p><strong>{completed}</strong> of {total} steps complete</p>}</div>
          {recentQuest && <div className="plan-created" role="status"><Check size={17}/><div><strong>Your plan is ready.</strong><span>{recentQuest.planSource === 'ai' ? 'Created with AI from your goal, time, and deadline.' : 'AI was unavailable, so QuestList used its offline planning fallback.'} Start with step one—everything else can wait.</span></div></div>}
          {quests.length === 0 ? (
            <div className="empty-state"><div className="empty-icon"><Leaf size={24}/></div><h3>Your path is open</h3><p>Describe a goal above and your first quest will take shape here.</p></div>
          ) : <div className="quest-grid">{quests.map(quest => {
            const done = quest.tasks.filter(t => t.done).length
            const questMinutes = quest.tasks.reduce((sum, task) => sum + (task.minutes ?? 25), 0)
            const questSessions = quest.tasks.reduce((sum, task) => sum + (task.sessions ?? 1), 0)
            const questPoints = quest.tasks.reduce((sum, task) => sum + task.points, 0)
            const milestone = REWARDS.find(reward => reward.points > points)
            return <article className={`quest-card ${quest.id === recentQuestId ? 'new-plan' : ''}`} key={quest.id}>
              <div className="quest-title"><div><div className="quest-labels"><span className="kicker">Ready-to-follow plan</span>{quest.planSource && <span className={`source-badge ${quest.planSource}`}>{quest.planSource === 'ai' ? 'AI planned' : 'Offline fallback'}</span>}</div><h3>{quest.title}</h3>{quest.deadline && <p className="deadline">Aim to finish by {new Date(`${quest.deadline}T00:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</p>}</div><span className="progress-number">{done}/{quest.tasks.length}</span></div>
              <div className="plan-summary" aria-label="Plan summary"><div><strong>{questMinutes < 60 ? `${questMinutes}m` : `${Math.floor(questMinutes/60)}h${questMinutes%60 ? ` ${questMinutes%60}m` : ''}`}</strong><span>estimated</span></div><div><strong>{questSessions}</strong><span>sessions</span></div><div><strong>{questPoints}</strong><span>points</span></div><div><strong>{milestone ? `${Math.max(0,milestone.points-points)} pts` : 'All'}</strong><span>{milestone ? 'to reward' : 'rewards reached'}</span></div></div>
              <div className="progress-track"><span style={{width: `${quest.tasks.length ? done / quest.tasks.length * 100 : 0}%`}}/></div>
              <div className="task-list">{quest.tasks.map(task => <div className={`task ${task.done ? 'done' : ''}`} key={task.id}>
                <button className="check" aria-label={task.done ? 'Mark incomplete' : 'Mark complete'} onClick={() => toggleTask(quest.id, task.id)}>{task.done ? <Check size={15}/> : <Circle size={18}/>}</button>
                <div className="task-content">{editingTaskId === task.id ? <input autoFocus value={task.title} aria-label="Edit task title" onChange={e => updateTask(quest.id, task.id, e.target.value)} onBlur={() => setEditingTaskId(null)} onKeyDown={e => { if (e.key === 'Enter') setEditingTaskId(null) }}/> : <strong>{task.title}</strong>}<span>{task.minutes ?? 25} min · {(task.sessions ?? 1) === 1 ? `1 focus session` : `${task.sessions} focus sessions`}</span></div><span className="task-points">+{task.points}</span><button className="edit-task" aria-label={`Edit ${task.title}`} onClick={() => setEditingTaskId(task.id)}><Edit3 size={14}/></button>
              </div>)}</div>
              <div className="optional-edit"><span>Plan ready as-is · editing is optional</span><div><button className="delete-quest" onClick={() => deleteQuest(quest)}><Trash2 size={14}/> Delete quest</button><button className="add-task" onClick={() => addTask(quest.id)}><Plus size={16}/> Add a step</button></div></div>
            </article>
          })}</div>}
        </section>

        <section className="focus-section" id="focus">
          <div className="focus-copy"><span className="kicker">Make a little space</span><h2>One thing.<br/><em>Twenty-five minutes.</em></h2><p>Set everything else down. A focused session earns 15 points—and, more importantly, moves the story forward.</p><div className="focus-note"><Flame size={18}/><span><strong>Small fires burn bright.</strong><br/>One honest session is enough for today.</span></div></div>
          <div className="timer-card">
            <span className="timer-label">Focus session</span>
            <div className="timer" aria-live="off">{mins}<span>:</span>{secs}</div>
            <div className="timer-controls">
              <button className="timer-main" onClick={toggleTimer}>{timerRunning ? <Pause size={20}/> : <Play size={20}/>} {timerRunning ? 'Pause' : seconds === 0 ? 'Start again' : 'Begin focus'}</button>
              <button className="timer-reset" aria-label="Reset timer" onClick={resetTimer}><RotateCcw size={19}/></button>
            </div>
            <div className="ambience-panel">
              <label htmlFor="ambience"><Music2 size={15}/> Focus sound</label>
              <select id="ambience" value={ambience} onChange={e => { stopAmbience(); setAmbience(e.target.value as Ambience) }} disabled={timerRunning}>
                <option value="none">Quiet</option><option value="pad">Warm ambient pad</option><option value="chimes">Sparse soft chimes</option>
              </select>
              <label className="volume-control" aria-label="Ambience volume"><Volume2 size={15}/><input type="range" min="0" max="0.7" step="0.01" value={volume} onChange={e => setVolume(Number(e.target.value))}/></label>
            </div>
            <p className="audio-note">Sound begins only when you begin focus.</p>
            <div className={`session-message ${timerComplete ? 'visible' : ''}`}><Check size={16}/> Session complete. 15 points added.</div>
          </div>
        </section>

        <section className="rewards-section">
          <div className="section-heading"><div><span className="kicker">Pause & enjoy</span><h2>Gentle rewards</h2></div><p>Points mark your progress—they’re never spent.</p></div>
          <div className="reward-grid">{REWARDS.map(reward => {
            const unlocked = points >= reward.points
            const claimed = claimedRewards.includes(reward.points)
            const Icon = reward.icon
            const celebrating = celebratingReward === reward.points
            return <article className={`reward-card ${unlocked ? 'unlocked' : ''} ${celebrating ? 'celebrating' : ''}`} key={reward.points}><div className="reward-icon"><Icon size={22}/></div><div><span>{reward.points} points</span><h3>{reward.title}</h3><p>{celebrating ? 'A gentle pause, well earned.' : reward.note}</p></div>{unlocked && <button onClick={() => claimReward(reward.points)} disabled={claimed}>{claimed ? <><Check size={13}/> Reward enjoyed</> : 'Mark enjoyed'}</button>}</article>
          })}</div>
          {nextReward && <p className="next-reward">Only <strong>{nextReward.points - points} points</strong> until “{nextReward.title}”.</p>}
        </section>
      </main>

      <footer><a className="brand" href="#top"><span className="brand-mark"><Leaf size={17}/></span>QuestList</a><p>Made for steady, human-sized progress.</p><span>Stored locally · No account needed</span></footer>
    </div>
  )
}
