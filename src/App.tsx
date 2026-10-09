import { useMemo, useRef, useState } from 'react'
import {
  ArrowDownUp, ArrowRight, Bell, Check, CheckCheck, ChevronDown,
  Clock3, FileText, Inbox, LayoutDashboard, ListTodo, LockKeyhole,
  MessageSquareText, Plus, ShieldCheck,
  Sparkles, Upload, Users, X,
} from 'lucide-react'
import { demoConversation, demoName, demoRole } from './lib/demo'
import { isRecognizableConversation, parseConversation } from './lib/parser'
import type { AnalysisItem, AnalysisResult, FilterKey, Message } from './types'
import './App.css'

const filters: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All updates' },
  { key: 'urgent', label: 'Urgent' },
  { key: 'tasks', label: 'My tasks' },
  { key: 'decisions', label: 'Decisions' },
  { key: 'mentions', label: 'Mentions' },
  { key: 'completed', label: 'Completed' },
]

function App() {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [conversation, setConversation] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [sortByDeadline, setSortByDeadline] = useState(false)
  const [selected, setSelected] = useState<AnalysisItem | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showAnalysisConsent, setShowAnalysisConsent] = useState(false)
  const [pendingAnalysis, setPendingAnalysis] = useState<{ messages: Message[]; userName: string; role: string } | null>(null)
  const [conversationName, setConversationName] = useState('Product launch · #team-project')
  const [previewMode, setPreviewMode] = useState(false)
  const [isDemo, setIsDemo] = useState(false)
  const [showWhatsAppInstructions, setShowWhatsAppInstructions] = useState(false)
  const [showSafeSkip, setShowSafeSkip] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const importPanelRef = useRef<HTMLElement>(null)
  const analysisAbortRef = useRef<AbortController | null>(null)
  const previewMessages = useMemo(() => parseConversation(conversation), [conversation])

  const allItems = useMemo(() => result ? [
    ...result.tasks.map((item) => ({ ...item, kind: 'task' as const })),
    ...result.decisions.map((item) => ({ ...item, kind: 'decision' as const })),
    ...result.mentions.map((item) => ({ ...item, kind: 'mention' as const })),
    ...result.updates.map((item) => ({ ...item, kind: 'update' as const })),
    ...result.completed.map((item) => ({ ...item, kind: 'completed' as const })),
  ] : [], [result])

  const filteredItems = useMemo(() => {
    let items = allItems
    if (filter === 'urgent') items = items.filter((item) => item.priority === 'high' && item.kind === 'task' && item.status === 'pending' && item.owner?.toLowerCase() === name.trim().toLowerCase())
    if (filter === 'tasks') items = items.filter((item) => item.kind === 'task' && item.status === 'pending' && item.owner?.toLowerCase() === name.trim().toLowerCase())
    if (filter === 'decisions') items = items.filter((item) => item.kind === 'decision')
    if (filter === 'mentions') items = items.filter((item) => item.kind === 'mention')
    if (filter === 'completed') items = items.filter((item) => item.kind === 'completed' || item.status === 'completed')
    return [...items].sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 }
      if (sortByDeadline && a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline)
      if (sortByDeadline && a.deadline) return -1
      if (sortByDeadline && b.deadline) return 1
      return rank[a.priority] - rank[b.priority]
    })
  }, [allItems, filter, name, sortByDeadline])
  const safeSkipItems = useMemo(() => result ? [
    ...result.safeToSkip,
    ...allItems.filter((item) => item.priority === 'low' && item.status !== 'completed'),
  ] : [], [allItems, result])
  const visibleItems = showSafeSkip ? safeSkipItems : filteredItems

  const urgentCount = useMemo(() => result?.tasks.filter((task) =>
    task.status === 'pending' && task.priority === 'high' && task.owner?.toLowerCase() === name.trim().toLowerCase()).length ?? 0, [result, name])
  const nextStepTasks = result
    ? [...result.tasks, ...result.completed.filter((task) => task.completionSource === 'user')]
      .filter((task) => task.owner?.toLowerCase() === name.trim().toLowerCase())
      .slice(0, 3)
    : []

  function openImport() {
    setError('')
    replaceConversation('', 'New conversation')
    setShowWhatsAppInstructions(false)
    setShowSafeSkip(false)
    setPreviewMode(true)
    window.setTimeout(() => {
      importPanelRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
      document.getElementById('conversation-input')?.focus()
    }, 0)
  }

  function replaceConversation(text: string, label: string) {
    analysisAbortRef.current?.abort()
    analysisAbortRef.current = null
    setBusy(false)
    setShowAnalysisConsent(false)
    setPendingAnalysis(null)
    setConversation(text)
    setConversationName(label)
    setMessages([])
    setResult(null)
    setSelected(null)
    setFilter('all')
    setShowSafeSkip(false)
    setShowWhatsAppInstructions(false)
    setIsDemo(false)
  }

  function openWhatsAppInstructions() {
    setShowWhatsAppInstructions(true)
  }

  function redirectToWhatsAppWeb() {
    window.open('https://web.whatsapp.com/', '_blank', 'noopener,noreferrer')
  }

  function runAnalysis(text = conversation, nextName = name, nextRole = role) {
    setError('')
    const parsed = parseConversation(text)
    if (!text.trim()) {
      setError('Add a conversation first. Paste messages, upload a .txt file, or load the sample.')
      setResult(null)
      setMessages([])
      setPendingAnalysis(null)
      return
    }
    if (!isRecognizableConversation(text)) {
      setError('We couldn’t find recognizable chat messages. Use lines like “Name: message” or upload a WhatsApp .txt export.')
      setResult(null)
      setMessages([])
      setPendingAnalysis(null)
      return
    }
    setPendingAnalysis({ messages: parsed, userName: nextName, role: nextRole })
    setShowAnalysisConsent(true)
  }

  async function continueWithGemini() {
    if (!pendingAnalysis || busy) return
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort('timeout'), 55_000)
    analysisAbortRef.current = controller
    setShowAnalysisConsent(false)
    setError('')
    setBusy(true)
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: pendingAnalysis.messages,
          userName: pendingAnalysis.userName,
          role: pendingAnalysis.role,
        }),
      })
      let data: unknown
      try {
        data = await response.json()
      } catch {
        throw new Error('The analysis service returned an unreadable response. Restart the app server and retry.')
      }
      if (!response.ok) {
        const message = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
          ? data.error
          : 'Gemini analysis failed. Please try again.'
        throw new Error(message)
      }
      if (analysisAbortRef.current !== controller) return
      if (!isAnalysisResult(data, pendingAnalysis.messages)) {
        throw new Error('Gemini returned an invalid analysis. Please retry; no placeholder results were used.')
      }
      const openMine = data.tasks.filter((task) =>
        task.status === 'pending' && task.owner?.toLowerCase() === pendingAnalysis.userName.trim().toLowerCase()).length
      const deadlines = data.tasks.filter((task) =>
        task.status === 'pending' && !!task.deadline && !/^unclear\b/i.test(task.deadline)).length
      setMessages(pendingAnalysis.messages)
      setResult({
        ...data,
        unreadCount: pendingAnalysis.messages.length,
        myOpenTasks: openMine,
        deadlineCount: deadlines,
        chatterCount: data.safeToSkip.length,
      })
      setFilter('all')
      setSortByDeadline(false)
      setSelected(null)
      setPreviewMode(false)
      setPendingAnalysis(null)
    } catch (requestError) {
      if (controller.signal.reason === 'timeout') {
        setError('Gemini took too long to respond. Retry, or try a shorter conversation.')
      } else if (!controller.signal.aborted) {
        setError(requestError instanceof Error ? requestError.message : 'Gemini analysis failed. Please retry.')
      }
    } finally {
      window.clearTimeout(timeoutId)
      if (analysisAbortRef.current === controller) {
        analysisAbortRef.current = null
        setBusy(false)
      }
    }
  }

  function loadDemo() {
    replaceConversation(demoConversation, 'Product launch · #team-project')
    setName(demoName)
    setRole(demoRole)
    setIsDemo(true)
    runAnalysis(demoConversation, demoName, demoRole)
  }

  function clearSession() {
    analysisAbortRef.current?.abort()
    analysisAbortRef.current = null
    setBusy(false)
    setShowAnalysisConsent(false)
    setPendingAnalysis(null)
    setConversation('')
    setMessages([])
    setResult(null)
    setName('')
    setRole('')
    setFilter('all')
    setSortByDeadline(false)
    setSelected(null)
    setError('')
    setConversationName('New conversation')
    setIsDemo(false)
    setPreviewMode(true)
  }

  async function handleFile(file?: File) {
    if (!file) return
    setError('')
    if (!file.name.toLowerCase().endsWith('.txt')) {
      setError('That file type isn’t supported. Choose a plain text .txt export.')
      return
    }
    if (file.size > 2_000_000) {
      setError('This file is over 2 MB. Try a smaller conversation export.')
      return
    }
    try {
      const text = await file.text()
      if (!text.trim()) {
        setError('This file is empty. Choose a .txt file that contains chat messages.')
        return
      }
      if (!isRecognizableConversation(text)) {
        setError('We couldn’t find recognizable chat messages. Use lines like “Name: message” or upload a WhatsApp .txt export.')
        return
      }
      replaceConversation(text, file.name.replace(/\.txt$/i, ''))
      setPreviewMode(true)
    } catch {
      setError('We couldn’t read that file. Try opening it and pasting the conversation instead.')
    }
  }

  function toggleTaskCompletion(task: AnalysisItem & { completionSource?: 'conversation' | 'user' }) {
    if (!result) return
    const wasCompleted = task.status === 'completed'
    const updatedTask = {
      ...task,
      kind: wasCompleted ? 'task' as const : 'completed' as const,
      status: wasCompleted ? 'pending' as const : 'completed' as const,
      completionSource: wasCompleted ? undefined : 'user' as const,
      reason: wasCompleted
        ? 'Reopened by you. The linked message shows the original task assignment.'
        : 'Marked complete by you. The linked message shows the original task assignment.',
    }
    const remainingTasks = result.tasks.filter((item) => item.id !== task.id)
    const remainingCompleted = result.completed.filter((item) => item.id !== task.id)
    const nextTasks = wasCompleted ? [...remainingTasks, updatedTask] : remainingTasks
    const nextCompleted = wasCompleted ? remainingCompleted : [...remainingCompleted, updatedTask]
    setResult({
      ...result,
      tasks: nextTasks,
      completed: nextCompleted,
      myOpenTasks: nextTasks.filter((item) => item.status === 'pending' && item.owner?.toLowerCase() === name.trim().toLowerCase()).length,
      deadlineCount: nextTasks.filter((item) => item.status === 'pending' && !!item.deadline && !item.deadline.startsWith('Unclear')).length,
    })
    setSelected(updatedTask)
  }

  function selectEvidence(item: AnalysisItem) {
    setSelected(item)
    const firstId = item.sourceIds[0]
    window.setTimeout(() => document.getElementById(`message-${firstId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
  }

  function messageById(id: string) {
    return messages.find((message) => message.id === id)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><span /></div>
          <span>What Did I Miss?</span>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <div className="nav-link active"><LayoutDashboard size={17} /> Overview</div>
        <button className="nav-link" onClick={openImport}><Plus size={17} /> Import conversation</button>
        <div className="sidebar-section">
          <div className="section-label">YOUR INBOX <span>{result?.unreadCount ?? 0}</span></div>
          {result && <div className="conversation-link selected"><span className="conversation-dot" /><span className="conversation-name">{conversationName}</span>{isDemo && <span className="demo-pill">DEMO</span>}</div>}
          {!result && <p className="sidebar-empty">Your next conversation goes here.</p>}
        </div>
        <button className="sample-link" onClick={loadDemo}><Sparkles size={15} /> Try sample conversation <ArrowRight size={14} /></button>
        <div className="sidebar-bottom">
          <div className="privacy-pill"><LockKeyhole size={14} /><span>Consent required</span><Check size={14} /></div>
          <p>Conversation sent to Gemini only after you continue.</p>
          <button className="nav-link clear-link" onClick={clearSession}><X size={16} /> Clear session</button>
          <div className="profile">
            <div className="avatar">{name.trim().slice(0, 1).toUpperCase() || '?'}</div>
            <div><strong>{name || 'Name not set'}</strong><small>{role || 'Personal workspace'}</small></div>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>What Did I Miss?</span><span className="crumb-slash">/</span><strong>{result ? conversationName : 'Your inbox'}</strong></div>
          <div className="topbar-actions">{isDemo && <span className="demo-pill">DEMO</span>}<div className="local-badge"><span /> GEMINI AI ANALYSIS</div></div>
        </header>

        <div className="content">
          <section className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> {isDemo ? 'DEMO RECAP' : 'YOUR PERSONAL RECAP'}</div>
              <h1>What Did I <em>Miss?</em></h1>
              <p className="heading-subtitle">Don’t read everything. Know everything that matters.</p>
            </div>
            {result && <button className="outline-button" onClick={openImport}><Plus size={16} /> New conversation</button>}
          </section>

          {(!result || previewMode) && (
            <section className="import-panel" ref={importPanelRef}>
              <div className="import-title"><div className="import-icon"><MessageSquareText size={19} /></div><div><h2>{result ? 'Analyze another conversation' : 'No conversation analyzed yet.'}</h2><p>Paste a chat or upload a .txt export. Gemini processes it only after your consent.</p></div>{result && <button className="icon-button close-import" onClick={() => setPreviewMode(false)} aria-label="Close import"><X size={18} /></button>}</div>
              <div className="profile-fields">
                <label>Your name <span className="optional">OPTIONAL · USED TO IDENTIFY YOUR ASSIGNMENTS</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter your name to personalize tasks" /></label>
                <label>Your role <span className="optional">OPTIONAL</span><input value={role} onChange={(event) => setRole(event.target.value)} placeholder="Your project responsibility" /></label>
              </div>
              <label className="input-label" htmlFor="conversation-input">Conversation</label>
              <textarea id="conversation-input" value={conversation} onChange={(event) => { replaceConversation(event.target.value, 'Pasted conversation'); setPreviewMode(true) }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void handleFile(event.dataTransfer.files[0]) }} placeholder={'Paste chat text here, or import a WhatsApp .txt export.\n\n[9:05 AM] Sam: Can you send the draft by Friday?'} />
              {conversation.trim() && <p className="preview-count" role="status">{previewMessages.length} {previewMessages.length === 1 ? 'message' : 'messages'} ready to analyze</p>}
              <div className="import-controls">
                <button className="upload-button" onClick={() => inputRef.current?.click()}><Upload size={15} /> Upload .txt</button>
                <button className="upload-button whatsapp-import-button" onClick={openWhatsAppInstructions}><MessageSquareText size={15} /> Import from WhatsApp</button>
                <span className="file-hint">Plain text · max 2 MB · Gemini after consent</span>
                <button className="analyze-button" disabled={!conversation.trim() || busy} onClick={() => runAnalysis()}>{busy ? <span className="spinner" /> : <Sparkles size={16} />}{busy ? 'Analyzing with Gemini…' : 'Analyze conversation'}<ArrowRight size={15} /></button>
              </div>
              {showWhatsAppInstructions && <div className="whatsapp-modal-backdrop">
                <section className="whatsapp-instructions" role="dialog" aria-modal="true" aria-labelledby="whatsapp-instructions-title">
                  <div className="whatsapp-instructions-heading"><strong id="whatsapp-instructions-title">Import a WhatsApp chat</strong><button className="icon-button" onClick={() => setShowWhatsAppInstructions(false)} aria-label="Close WhatsApp instructions"><X size={16} /></button></div>
                  <ol>
                    <li>Open WhatsApp and select the conversation.</li>
                    <li>Use WhatsApp’s supported <strong>Export chat</strong> option. Availability and steps vary by device and version; mobile may be required.</li>
                    <li>Choose <strong>Without media</strong>.</li>
                    <li>WhatsApp may provide the export as a ZIP file. Extract it and select the <code>.txt</code> chat file below; this app accepts <code>.txt</code> files only.</li>
                    <li>Return here and upload that file. What Did I Miss? cannot read chats from the WhatsApp website.</li>
                  </ol>
                  <div className="whatsapp-modal-actions">
                    <button className="upload-button" onClick={() => inputRef.current?.click()}><Upload size={14} /> Choose exported .txt file</button>
                    <button className="analyze-button" onClick={redirectToWhatsAppWeb}>Redirect to WhatsApp Web <ArrowRight size={15} /></button>
                  </div>
                </section>
              </div>}
              <div className="import-footer"><span><ShieldCheck size={14} /> Conversation and optional profile details are sent to Google Gemini only after consent.</span><button className="text-button" onClick={loadDemo}><Sparkles size={14} /> Try the sample conversation</button></div>
              {error && <div className="error-message" role="alert">{error}</div>}
            </section>
          )}
          <input ref={inputRef} type="file" accept=".txt,text/plain" className="hidden-input" onChange={(event) => { void handleFile(event.target.files?.[0]); event.target.value = '' }} />
          {!result && <section className="conversation-summary empty-conversation-summary"><h2>Conversation summary</h2><p>Import a conversation to see its summary.</p></section>}

          {result && !previewMode && (
            <>
              <section className="stats-row">
                <div className="stat-card unread-stat"><div className="stat-icon"><Inbox size={17} /></div><div><span>MESSAGES CAUGHT UP</span><strong>{result.unreadCount}<small> messages</small></strong></div></div>
                <div className="stat-card"><div className="stat-icon green"><ListTodo size={17} /></div><div><span>{name ? 'YOUR OPEN TASKS' : 'OPEN TASKS'}</span><strong>{name ? result.myOpenTasks : result.tasks.length}</strong></div></div>
                <div className="stat-card"><div className="stat-icon amber"><Clock3 size={17} /></div><div><span>DEADLINES TO KNOW</span><strong>{result.deadlineCount}</strong></div></div>
                <div className="stat-card"><div className="stat-icon blue"><Users size={17} /></div><div><span>DECISIONS MADE</span><strong>{result.decisions.filter((item) => item.status === 'current').length}</strong></div></div>
              </section>

              <section className="recap-banner">
                <div className="recap-symbol"><Sparkles size={18} /></div>
                <div className="recap-copy"><div className="recap-label">THE QUICK RECAP <span>·</span> {result.unreadCount} MESSAGES</div><p>{result.summary}</p></div>
                {isDemo && <div className="recap-time"><span>DEMO DATA</span></div>}
              </section>

              <section className="conversation-summary">
                <h2>Conversation summary</h2>
                <p>{result.conversationSummary}</p>
              </section>

              <section className="dashboard-grid">
                <div className="updates-column">
                  <div className="section-heading">
                    <div><h2>What matters to you</h2><p>Prioritized for {name || 'you'}{role ? ` · ${role}` : ''}</p></div>
                    <button className="sort-button" onClick={() => setSortByDeadline((value) => !value)} aria-label={`Sort by ${sortByDeadline ? 'priority' : 'deadline'}`}><ArrowDownUp size={14} /> {sortByDeadline ? 'Deadline' : 'Priority'} <ChevronDown size={13} /></button>
                  </div>
                  <div className="filter-bar" role="tablist" aria-label="Filter conversation insights">
                    {filters.map((item) => <button key={item.key} role="tab" aria-selected={filter === item.key} className={filter === item.key ? 'filter-chip active' : 'filter-chip'} onClick={() => setFilter(item.key)}>{item.label}{item.key === 'urgent' && urgentCount > 0 && <span className="filter-count">{urgentCount}</span>}</button>)}
                  </div>
                  <div className="items-list">
                    {visibleItems.map((item) => <InsightRow key={item.id} item={item} selected={selected?.id === item.id} onClick={() => selectEvidence(item)} />)}
                    {visibleItems.length === 0 && <div className="no-results"><CheckCheck size={19} /><strong>Nothing in this view</strong><span>Try another filter or check back later.</span></div>}
                  </div>
                  <div className="skip-card"><div className="skip-icon"><MessageSquareText size={16} /></div><div><strong>Safe to skip</strong><p>{result.chatterCount} low-priority messages and {safeSkipItems.length - result.safeToSkip.length} other low-priority items identified in this conversation.</p></div><button className="text-button" onClick={() => setShowSafeSkip((current) => !current)}>{showSafeSkip ? 'Back to previous view' : 'See all'} <ArrowRight size={13} /></button></div>
                </div>

                <aside className="right-column">
                  <div className="right-card action-card">
                    <div className="right-card-heading"><div><div className="mini-icon green"><ListTodo size={15} /></div><h3>Your next steps</h3></div><span className="count-bubble">{result.myOpenTasks}</span></div>
                    {nextStepTasks.map((task) => <div className="next-step" key={task.id}><input className="todo-check" type="checkbox" checked={task.status === 'completed'} onChange={() => toggleTaskCompletion(task)} aria-label={`${task.status === 'completed' ? 'Reopen' : 'Mark'} ${task.title} ${task.status === 'completed' ? 'task' : 'complete'}`} /><button className="next-step-evidence" onClick={() => selectEvidence({ ...task, kind: 'task' })}><strong>{task.title}</strong><small>{task.deadline || 'No deadline mentioned'}{task.completionSource === 'user' ? ' · marked complete by you' : ''}</small></button><ArrowRight size={14} /></div>)}
                    {!name && <p className="right-empty">Enter your name to identify your tasks. The conversation itself remains unassigned to your profile.</p>}
                    {name && result.myOpenTasks === 0 && <p className="right-empty">No open tasks assigned to you. You’re all caught up.</p>}
                  </div>
                  <div className="right-card decisions-card"><div className="right-card-heading"><div><div className="mini-icon blue"><Users size={14} /></div><h3>Decisions that changed</h3></div></div>
                    {result.decisions.slice(0, 3).map((decision) => <button className="decision-row" key={decision.id} onClick={() => selectEvidence({ ...decision, kind: 'decision' })}><span className="decision-dot" /><span><strong>{decision.title}</strong><small>{decision.status === 'current' ? 'Current decision' : 'Superseded'}</small></span></button>)}
                    {!result.decisions.length && <p className="right-empty">No explicit decisions found in this conversation.</p>}
                  </div>
                  <div className="privacy-card"><div className="privacy-shield"><LockKeyhole size={17} /></div><div><strong>You choose when to share.</strong><p>Your conversation is sent to Google Gemini only after you continue. This app keeps no server-side conversation history.</p><span><span className="online-dot" /> CONSENT REQUIRED</span></div></div>
                  <div className="small-note"><Bell size={13} /> Only explicit assignments become your tasks. Mentions alone aren’t treated as action.</div>
                </aside>
              </section>

              {selected && <section className="evidence-panel" aria-live="polite"><div className="evidence-header"><div><span className="evidence-kicker">SOURCE MESSAGE</span><h3>Why this matters</h3></div><button className="icon-button" onClick={() => setSelected(null)} aria-label="Close evidence"><X size={17} /></button></div><p className="evidence-reason">{selected.reason}</p>{selected.sourceIds.map((id) => { const message = messageById(id); return message ? <div className="source-message" key={id} id={`message-${id}`}><div className="source-meta"><strong>{message.sender}</strong><time>{message.timestamp || 'Timestamp not provided'}</time></div><p>{message.text}</p></div> : <div className="missing-source" key={id}>Original message is unavailable in this conversation.</div> })}</section>}

              <section className="transcript-panel"><div className="transcript-heading"><div><h2>Conversation trail</h2><p>Tap an insight above to jump to its source message.</p></div><span><MessageSquareText size={14} /> {messages.length} messages</span></div>
                <div className="transcript-list">{messages.slice(0, 80).map((message) => <article className={`transcript-message ${selected?.sourceIds.includes(message.id) ? 'highlighted' : ''}`} id={`message-${message.id}`} key={message.id}><div className="transcript-meta"><strong>{message.sender}</strong><time>{message.timestamp}</time></div><p>{message.text}</p></article>)}{messages.length > 80 && <p className="transcript-truncated">Showing the first 80 messages to keep the page responsive. Analysis includes all {messages.length}.</p>}</div>
              </section>
            </>
          )}
          <footer className="page-footer"><span>What Did I Miss? <span>·</span> Don’t read everything. Know everything that matters.</span><span><LockKeyhole size={12} /> Gemini processing requires your consent.</span></footer>
        </div>
      </main>
      {showAnalysisConsent && <div className="whatsapp-modal-backdrop">
        <section className="whatsapp-instructions consent-modal" role="dialog" aria-modal="true" aria-labelledby="analysis-consent-title">
          <div className="whatsapp-instructions-heading"><strong id="analysis-consent-title">Before Gemini analyzes this conversation</strong><button className="icon-button" onClick={() => { setShowAnalysisConsent(false); setPendingAnalysis(null) }} aria-label="Cancel analysis"><X size={16} /></button></div>
          <p>Your conversation and optional name or role will be sent to Google’s Gemini API for AI processing. This is not local-only analysis. Continue only if you consent to sharing this information with Google.</p>
          <p>What Did I Miss? does not save conversations on its server. Gemini interaction storage is disabled for this request; Google still processes it under its Gemini API terms.</p>
          {error && <div className="error-message" role="alert">{error}</div>}
          <div className="whatsapp-modal-actions">
            <button className="upload-button" disabled={busy} onClick={() => { setShowAnalysisConsent(false); setPendingAnalysis(null) }}>Cancel</button>
            <button className="analyze-button" disabled={busy} onClick={() => void continueWithGemini()}>{busy ? <span className="spinner" /> : <Sparkles size={15} />}{busy ? 'Analyzing…' : 'I consent — Continue'}<ArrowRight size={15} /></button>
          </div>
        </section>
      </div>}
    </div>
  )
}

function InsightRow({ item, selected, onClick }: { item: AnalysisItem; selected: boolean; onClick: () => void }) {
  const isTask = item.kind === 'task'
  const isDecision = item.kind === 'decision'
  const isMention = item.kind === 'mention'
  const completed = item.status === 'completed' || item.kind === 'completed'
  const label = isTask ? (completed ? 'COMPLETED' : item.status.toUpperCase()) : isDecision ? 'DECISION' : isMention ? 'MENTION' : 'UPDATE'
  return <button className={`insight-row ${selected ? 'selected' : ''}`} onClick={onClick}>
    <span className={`priority-mark ${item.priority}`} aria-label={`${item.priority} priority`}>{isTask && completed ? <Check size={15} /> : isDecision ? <Users size={15} /> : isMention ? <Bell size={15} /> : <FileText size={15} />}</span>
    <span className="insight-body"><span className="insight-tags"><span className={`type-tag ${isTask && !completed ? 'action-tag' : isDecision ? 'decision-tag' : isMention ? 'mention-tag' : completed ? 'done-tag' : ''}`}>{completed ? 'COMPLETED' : item.status === 'unclear' ? 'UNCLEAR OWNER' : label}</span><span className={`priority-tag ${item.priority}`}>{item.priority} priority</span></span><strong>{item.title}</strong><span className="insight-reason">{item.reason}</span><span className="insight-meta">{item.owner && <span><Users size={12} /> {item.owner}</span>}{item.deadline && <span><Clock3 size={12} /> {item.deadline}</span>}<span>{item.sourceIds.length} source{item.sourceIds.length === 1 ? '' : 's'}</span></span></span>
    <ArrowRight className="row-arrow" size={16} />
  </button>
}

export default App

function isAnalysisResult(value: unknown, messages: Message[]): value is AnalysisResult {
  if (!value || typeof value !== 'object') return false
  const result = value as Record<string, unknown>
  const listKeys = ['tasks', 'completed', 'decisions', 'mentions', 'updates', 'safeToSkip']
  if (typeof result.summary !== 'string' || typeof result.conversationSummary !== 'string' ||
      !listKeys.every((key) => Array.isArray(result[key]))) return false
  const sourceIds = new Set(messages.map((message) => message.id))
  return listKeys.every((key) => (result[key] as unknown[]).every((item) => {
    if (!item || typeof item !== 'object') return false
    const finding = item as Record<string, unknown>
    return typeof finding.id === 'string' &&
      typeof finding.title === 'string' &&
      typeof finding.reason === 'string' &&
      Array.isArray(finding.sourceIds) && finding.sourceIds.length > 0 &&
      finding.sourceIds.every((id) => typeof id === 'string' && sourceIds.has(id))
  }))
}
