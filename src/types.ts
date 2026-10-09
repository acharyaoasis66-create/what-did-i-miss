export type Priority = 'high' | 'medium' | 'low'
export type TaskStatus = 'pending' | 'completed' | 'cancelled' | 'superseded' | 'unclear'
export type FilterKey = 'all' | 'urgent' | 'tasks' | 'decisions' | 'mentions' | 'completed'
export type ItemKind = 'task' | 'decision' | 'mention' | 'update' | 'completed'

export interface Message {
  id: string
  sender: string
  timestamp: string
  text: string
  order: number
}

export interface AnalysisItem {
  id: string
  title: string
  status: TaskStatus | 'current'
  priority: Priority
  owner?: string
  deadline?: string
  reason: string
  sourceIds: string[]
  kind: ItemKind
}

export interface TaskItem extends AnalysisItem {
  kind: 'task' | 'completed'
  completionSource?: 'conversation' | 'user'
}

export interface DecisionItem extends AnalysisItem {
  kind: 'decision'
  status: 'current' | 'superseded' | 'cancelled'
}

export interface AnalysisResult {
  summary: string
  conversationSummary: string
  tasks: TaskItem[]
  completed: TaskItem[]
  decisions: DecisionItem[]
  mentions: AnalysisItem[]
  updates: AnalysisItem[]
  safeToSkip: AnalysisItem[]
  unreadCount: number
  myOpenTasks: number
  deadlineCount: number
  chatterCount: number
}
