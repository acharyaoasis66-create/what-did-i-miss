import type { Message } from '../types'

const patterns = [
  /^\[(.+?)\]\s*([^:]+?):\s*(.*)$/,
  /^(\d{1,4}[/-]\d{1,2}[/-]\d{1,4},?\s+[^-]+?)\s+-\s+([^:]+?):\s*(.*)$/,
  /^([^:\n]{1,48}?)\s+\(([^)]{1,36})\):\s*(.*)$/,
  /^([^:\n]{1,48}):\s+(.*)$/,
]

export function isRecognizableConversation(input: string): boolean {
  return input.split(/\r?\n/).some((line) => patterns.some((pattern) => pattern.test(line.trim())))
}

export function parseConversation(input: string): Message[] {
  const lines = input.replace(/\r\n?/g, '\n').split('\n')
  const messages: Omit<Message, 'id' | 'order'>[] = []
  for (const originalLine of lines) {
    const line = originalLine.trimEnd()
    if (!line.trim()) continue
    let match: RegExpMatchArray | null
    if ((match = line.match(patterns[0]))) {
      messages.push({ timestamp: match[1].trim(), sender: match[2].trim(), text: match[3].trim() })
    } else if ((match = line.match(patterns[1]))) {
      messages.push({ timestamp: match[1].trim(), sender: match[2].trim(), text: match[3].trim() })
    } else if ((match = line.match(patterns[2]))) {
      messages.push({ timestamp: match[2].trim(), sender: match[1].trim(), text: match[3].trim() })
    } else if ((match = line.match(patterns[3]))) {
      messages.push({ timestamp: '', sender: match[1].trim(), text: match[2].trim() })
    } else if (messages.length) {
      messages[messages.length - 1].text += `\n${line}`
    } else {
      messages.push({ timestamp: '', sender: 'Unknown sender', text: line.trim() })
    }
  }
  return messages.map((message, order) => ({ ...message, order, id: `message-${order + 1}` }))
}
