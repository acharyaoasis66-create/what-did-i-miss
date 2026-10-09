import type { AnalysisItem, AnalysisResult, DecisionItem, Message, Priority, TaskItem } from '../types'

const assignment = /^(?:(?:@([A-Z][\w-]{1,24})|([A-Z][a-z]{1,24}))\s*,\s*)?(?:please\s+)?(?:can you\s+)?(finish|complete|build|create|implement|review|fix|send|write|update|prepare|ship|test|check|own|handle|integrate|switch|add)\s+(?:the\s+)?(.+?)(?:[.!?])?$/i
const selfAssignment = /\b(?:I(?:'ll|’ll| will))\s+((?:finish|complete|build|create|implement|review|fix|send|write|update|prepare|ship|test|check|own|handle|integrate|switch)\s+.+?)(?:[.!?]|$)/i
const explicitDecision = /\b(?:we(?:'ve| have)?\s+decided\s+to|we(?:'re| are)\s+going\s+with|we(?:'ll| will)\s+use|we\s+confirmed|confirmed)\s+(?:that\s+)?(.+?)(?:[.!?]|$)/i
const completion = /\b(?:is|are|was|were)\s+(?:now\s+)?(?:complete|completed|done|finished)|\b(?:finished|completed|shipped|fixed|reviewed|passed)\b|\bchecks are green\b/i
const datePattern = /\b(?:by|before|due)\s+(?:(today|tomorrow|tonight|end of day|EOD|this (?:afternoon|evening|week)|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b(?:\s*(?:at)?\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?))?|(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?))\b/i
const timePattern = /\b(?:by|before|due)\s+(?:\d{1,2}(?::\d{2})?\s*(?:AM|PM)|\d{1,2}\s*(?:AM|PM))\b/i
const stopWords = new Set(['the', 'and', 'with', 'from', 'that', 'this', 'your', 'please', 'today', 'tomorrow', 'before', 'after', 'into', 'over', 'when', 'then', 'have', 'will', 'just', 'first', 'instead', 'still', 'here', 'there', 'for', 'our', 'their', 'finish', 'complete', 'build', 'create', 'implement', 'review', 'fix', 'send', 'write', 'update', 'prepare', 'ship', 'test', 'check', 'own', 'handle', 'integrate', 'switch', 'add', 'it'])
const topicStopWords = new Set([...stopWords, 'yeah', 'yes', 'ok', 'okay', 'thanks', 'thank', 'morning', 'team', 'quick', 'anyone', 'please', 'great', 'good', 'know', 'like', 'look', 'looks', 'get', 'got', 'can', 'could', 'would', 'need', 'let', 'today', 'tomorrow', 'one', 'use', 'using', 'still', 'really', 'much', 'also', 'just', 'going', 'make', 'made', 'working', 'work', 'done', 'well'])

function normalizeWords(value: string): string[] {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((word) => word.length > 2 && !stopWords.has(word))
}

function similarity(a: string, b: string): number {
  const first = new Set(normalizeWords(a))
  const second = new Set(normalizeWords(b))
  if (!first.size || !second.size) return 0
  const shared = [...first].filter((word) => second.has(word)).length
  return shared / Math.min(first.size, second.size)
}

function taskTitleFrom(match: RegExpMatchArray, assignedMatch: RegExpMatchArray | null): string {
  const rawTitle = assignedMatch ? `${assignedMatch[3]} ${assignedMatch[4]}` : match[1]
  return rawTitle.replace(/\s+(?:by|before|due)\b[\s\S]*$/i, '').replace(/\s+(?:sometime|today|tomorrow|tonight|this week)\b[\s\S]*$/i, '').replace(/\s+when you get a chance\b[\s\S]*$/i, '').replace(/[.!?]+$/, '').trim()
}

function deadlineFor(text: string): { label?: string; clear: boolean } {
  if (/\b(?:sometime|soon|when you get a chance|when possible|at some point)\b/i.test(text)) {
    return { label: 'Unclear · timing not specified', clear: false }
  }
  const match = text.match(datePattern)
  if (match) {
    const label = [match[1], match[2], match[3]].filter(Boolean).join(' ').trim()
    const vague = /sometime|soon|when you can|this week/i.test(text)
    return { label: vague ? `Unclear · ${label}` : label, clear: !vague }
  }
  const explicitTime = text.match(timePattern)
  if (explicitTime) {
    const relativeDay = text.match(/\b(today|tomorrow|tonight)\b/i)
    return { label: `${explicitTime[0].replace(/^(by|before|due)\s+/i, '')}${relativeDay ? ` ${relativeDay[1]}` : ''}`, clear: true }
  }
  const relativeDay = text.match(/\b(today|tomorrow|tonight)\b/i)
  return relativeDay ? { label: relativeDay[1], clear: true } : { clear: false }
}

function decisionTopic(title: string): string | undefined {
  if (/\b(?:firebase|supabase|backend|database)\b/i.test(title)) return 'platform'
  if (/\b(?:beta launch|launch date|launch|demo date)\b/i.test(title)) return 'launch'
  if (/\b(?:auth|login)\b/i.test(title)) return 'authentication'
  return undefined
}

function sameDecisionTopic(first: string, second: string): boolean {
  const firstTopic = decisionTopic(first)
  const secondTopic = decisionTopic(second)
  if (firstTopic || secondTopic) return firstTopic !== undefined && firstTopic === secondTopic
  return similarity(first, second) >= 0.55
}

function getPriority(owner: string | undefined, me: string, deadline: string | undefined, status: string): Priority {
  if (status !== 'pending') return 'low'
  const isMine = !!owner && !!me && owner.toLowerCase() === me.toLowerCase()
  if (isMine && deadline && /\b(?:today|tonight|end of day|EOD)\b/i.test(deadline)) return 'high'
  if (isMine || (!!deadline && !deadline.startsWith('Unclear'))) return 'medium'
  return 'low'
}

function reasonFor(owner: string | undefined, me: string, deadline: string | undefined, kind: string): string {
  if (kind === 'completed') return 'This work was explicitly marked complete, so it is not an open action.'
  if (kind === 'decision') return 'An explicit decision changes the direction of the project.'
  if (kind === 'mention') return 'You were mentioned, but no action was explicitly assigned to you.'
  if (!owner) return 'A task was discussed, but the conversation does not clearly name an owner.'
  if (owner && me && owner.toLowerCase() === me.toLowerCase() && deadline && !deadline.startsWith('Unclear')) return `Assigned to you with a stated deadline (${deadline}).`
  if (owner && me && owner.toLowerCase() === me.toLowerCase()) return 'This task was explicitly assigned to you; no clear deadline was stated.'
  if (deadline?.startsWith('Unclear')) return 'A task was discussed, but its timing is too vague to treat as a firm deadline.'
  return 'A relevant project update was explicitly shared in the conversation.'
}

export function analyzeConversation(messages: Message[], userName: string, role = ''): AnalysisResult {
  const me = userName.trim()
  const tasks: TaskItem[] = []
  const decisions: DecisionItem[] = []
  const mentions: AnalysisItem[] = []
  const updates: AnalysisItem[] = []
  const safeToSkip: AnalysisItem[] = []

  for (const message of messages) {
    const text = message.text.trim()
    const assignmentMatch = text.match(assignment)
    const owner = assignmentMatch?.[1] ?? assignmentMatch?.[2] ?? (selfAssignment.test(text) ? message.sender : undefined)
    const actionMatch = assignmentMatch ?? (owner ? text.match(selfAssignment) : null)
    if (actionMatch && normalizeWords(taskTitleFrom(actionMatch, assignmentMatch)).length > 0) {
      const title = taskTitleFrom(actionMatch, assignmentMatch)
      const deadline = deadlineFor(text)
      const duplicate = tasks.find((task) => similarity(task.title, title) >= 0.67)
      if (duplicate) {
        duplicate.sourceIds.push(message.id)
        if (!duplicate.owner && owner) duplicate.owner = owner
        if ((!duplicate.deadline || duplicate.deadline.startsWith('Unclear')) && deadline.label) duplicate.deadline = deadline.label
        if (duplicate.owner) {
          duplicate.status = 'pending'
          duplicate.priority = getPriority(duplicate.owner, me, duplicate.deadline, duplicate.status)
          duplicate.reason = reasonFor(duplicate.owner, me, duplicate.deadline, 'task')
        }
      } else {
        const mine = !!owner && !!me && owner.toLowerCase() === me.toLowerCase()
        const status = owner ? 'pending' : 'unclear'
        const priority = getPriority(owner, me, deadline.label, status)
        tasks.push({
          id: `task-${message.id}`, title: title.charAt(0).toUpperCase() + title.slice(1),
          owner, deadline: deadline.label, status, priority,
          reason: reasonFor(owner, me, deadline.label, 'task'), sourceIds: [message.id], kind: 'task',
        })
        if (mine && role) tasks[tasks.length - 1].reason = `Assigned to you as ${role}${deadline.label ? `, with a stated deadline (${deadline.label})` : ''}.`
      }
    }

    if (completion.test(text)) {
      const targetText = text.replace(/\b(?:is|are|was|were)\s+(?:now\s+)?(?:complete|completed|done|finished)|\b(?:finished|completed|shipped|fixed|reviewed|passed)\b|\bchecks are green\b/ig, ' ').trim()
      const match = [...tasks].filter((task) => task.status === 'pending' || task.status === 'unclear').sort((a, b) => similarity(b.title, targetText) - similarity(a.title, targetText))[0]
      if (match && similarity(match.title, targetText) >= 0.8) {
        match.status = 'completed'
        match.kind = 'completed'
        match.priority = 'low'
        match.sourceIds.push(message.id)
        match.reason = reasonFor(match.owner, me, match.deadline, 'completed')
      } else if (/\b(?:complete|completed|done|finished)\b/i.test(text)) {
        const title = text.replace(/^(?:the\s+)?/i, '').slice(0, 90)
        updates.push({ id: `update-${message.id}`, title, status: 'completed', priority: 'low', reason: 'A completion was reported, but no matching explicit task could be safely linked.', sourceIds: [message.id], kind: 'update' })
      }
    }

    const decisionMatch = text.match(explicitDecision)
    if (decisionMatch) {
      const title = decisionMatch[1].trim().replace(/[.!?]+$/, '')
      const existing = decisions.find((decision) => decision.status === 'current' && sameDecisionTopic(decision.title, title))
      if (existing && similarity(existing.title, title) >= 0.7) {
        existing.sourceIds.push(message.id)
      } else {
        if (existing) {
          existing.status = 'superseded'
          existing.sourceIds.push(message.id)
        }
        decisions.push({ id: `decision-${message.id}`, title, status: 'current', priority: 'medium', reason: existing ? `This newer explicit decision replaces “${existing.title}”.` : 'This was stated as a confirmed decision, not just a proposal.', sourceIds: [message.id], kind: 'decision' })
      }
    }

    if (me && new RegExp(`^(?:@${escapeRegex(me)}|${escapeRegex(me)}[, :])\\s*`, 'i').test(text)) {
      const isExplicitTask = tasks.some((task) => task.sourceIds.includes(message.id))
      if (!isExplicitTask) mentions.push({
        id: `mention-${message.id}`, title: text.length > 95 ? `${text.slice(0, 92)}…` : text,
        status: 'pending', priority: 'medium', reason: 'You were directly addressed, but the message does not clearly assign you a task.',
        sourceIds: [message.id], kind: 'mention',
      })
    }

    if (!assignmentMatch && !decisionMatch && !completion.test(text) && !mentions.some((item) => item.sourceIds.includes(message.id))) {
      const projectUpdate = /\b(?:launch|deadline|demo|release|blocked|ready|passed|green|review|design|api|auth|test|qa|checklist|integrat|config)\b/i.test(text)
      if (projectUpdate && !/coffee|lunch|playlist|typo|link went|found it/i.test(text)) {
        updates.push({ id: `update-${message.id}`, title: text.length > 96 ? `${text.slice(0, 93)}…` : text, status: 'pending', priority: /launch|demo|blocked|deadline/i.test(text) ? 'medium' : 'low', reason: 'A project status update that may affect your work.', sourceIds: [message.id], kind: 'update' })
      } else {
        safeToSkip.push({
          id: `low-priority-${message.id}`,
          title: text.length > 96 ? `${text.slice(0, 93)}…` : text,
          status: 'pending',
          priority: 'low',
          reason: 'No clear task, decision, direct mention, or project update was identified in this message.',
          sourceIds: [message.id],
          kind: 'update',
        })
      }
    }
  }

  const pendingMine = tasks.filter((task) => task.status === 'pending' && task.owner?.toLowerCase() === me.toLowerCase())
  const completed = tasks.filter((task) => task.status === 'completed')
  const currentDecisions = decisions.filter((decision) => decision.status === 'current')
  const conversationSummary = summarizeConversation(messages, tasks, currentDecisions, updates)
  return {
    summary: summarizeAnalysis(tasks, decisions, me),
    conversationSummary,
    tasks: tasks.filter((task) => task.status === 'pending' || task.status === 'unclear'),
    completed,
    decisions,
    mentions,
    updates,
    safeToSkip,
    unreadCount: messages.length,
    myOpenTasks: pendingMine.length,
    deadlineCount: tasks.filter((task) => task.status === 'pending' && !!task.deadline && !task.deadline.startsWith('Unclear')).length,
    chatterCount: safeToSkip.length,
  }
}

export function summarizeConversation(messages: Message[], tasks: TaskItem[], decisions: DecisionItem[], updates: AnalysisItem[]): string {
  const topicCounts = new Map<string, number>()
  for (const message of messages) {
    for (const word of message.text.toLowerCase().match(/[a-z][a-z0-9'-]{2,}/g) ?? []) {
      const normalized = word.replace(/'s$/, '')
      if (topicStopWords.has(word) || topicStopWords.has(normalized) || normalized.length < 3) continue
      topicCounts.set(normalized, (topicCounts.get(normalized) ?? 0) + 1)
    }
  }
  const topics = [...topicCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([topic]) => topic)
  const pending = tasks.filter((task) => task.status === 'pending' || task.status === 'unclear').length
  const completed = tasks.filter((task) => task.status === 'completed').length
  const findings: string[] = []
  if (decisions.length) findings.push(`The team confirmed ${decisions.slice(0, 2).map((decision) => decision.title).join('; ')}.`)
  if (pending || completed) {
    findings.push(`${pending} task${pending === 1 ? '' : 's'} remain open and ${completed} ${completed === 1 ? 'was' : 'were'} marked complete.`)
  }
  const relevantUpdates = updates.filter((item) => item.status !== 'completed').slice(0, 2)
  if (relevantUpdates.length) findings.push(`Other updates included ${relevantUpdates.map((item) => item.title.replace(/[.!?]+$/, '')).join('; ')}.`)

  if (!topics.length && !findings.length) {
    return `The conversation contains ${messages.length} message${messages.length === 1 ? '' : 's'}, but no recurring topics or key findings could be identified by the local rules.`
  }
  const overview = topics.length
    ? `Across ${messages.length} messages, recurring topics include ${topics.join(', ')}.`
    : `The conversation contains ${messages.length} messages.`
  if (!findings.length) return `${overview} No explicit tasks, confirmed decisions, or project updates were identified.`
  return `${overview} ${findings.join(' ')}`
}

export function summarizeAnalysis(tasks: TaskItem[], decisions: DecisionItem[], userName: string): string {
  const me = userName.trim().toLowerCase()
  const pendingMine = tasks.filter((task) => task.status === 'pending' && task.owner?.toLowerCase() === me)
  const unresolvedOwnerTasks = tasks.filter((task) => task.status === 'unclear')
  const currentDecisions = decisions.filter((decision) => decision.status === 'current')
  const completedTasks = tasks.filter((task) => task.status === 'completed')
  const markedByUser = completedTasks.filter((task) => task.completionSource === 'user').length
  const summaryParts = [
    me
      ? pendingMine.length
        ? `You have ${pendingMine.length} open task${pendingMine.length === 1 ? '' : 's'}${pendingMine.some((task) => task.deadline && !task.deadline.startsWith('Unclear')) ? `, including ${pendingMine.find((task) => task.deadline && !task.deadline.startsWith('Unclear'))?.title} due ${pendingMine.find((task) => task.deadline && !task.deadline.startsWith('Unclear'))?.deadline}` : ''}.`
        : 'No open tasks were explicitly assigned to you.'
      : `No name was provided, so personal task ownership is not inferred.${tasks.length ? ` ${tasks.length} task${tasks.length === 1 ? '' : 's'} were found; ${unresolvedOwnerTasks.length} ${unresolvedOwnerTasks.length === 1 ? 'has' : 'have'} unclear ownership.` : ''}`,
    currentDecisions.length ? `Current decisions: ${currentDecisions.slice(0, 2).map((decision) => decision.title).join('; ')}.` : '',
    completedTasks.length ? `${completedTasks.length} task${completedTasks.length === 1 ? '' : 's'} marked complete${markedByUser ? ` (${markedByUser} marked by you)` : ''}.` : '',
  ]
  return summaryParts.filter(Boolean).join(' ')
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
