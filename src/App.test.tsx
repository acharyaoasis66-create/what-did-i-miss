// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { analyzeConversation } from './lib/analyzer'
import type { Message } from './types'
import App from './App'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (_url: RequestInfo | URL, options?: RequestInit) => {
    const request = JSON.parse(String(options?.body)) as { messages: Message[]; userName: string; role: string }
    return {
      ok: true,
      json: async () => analyzeConversation(request.messages, request.userName, request.role),
    }
  }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function acceptGeminiConsent(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'I consent — Continue' }))
}

describe('conversation session flow', () => {
  it('starts empty with no fabricated counts or recap', () => {
    render(<App />)

    expect(screen.getByText('No conversation analyzed yet.')).toBeTruthy()
    expect(screen.queryByText(/MESSAGES CAUGHT UP/)).toBeNull()
    expect(screen.queryByText('THE QUICK RECAP')).toBeNull()
    expect(screen.getByText('Conversation summary')).toBeTruthy()
    expect(screen.getByText('Import a conversation to see its summary.')).toBeTruthy()
    expect(screen.queryByText('Alex')).toBeNull()
  })

  it('analyzes pasted messages and opens evidence from their actual sources', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText(/Your name/), 'Alex')
    fireEvent.change(screen.getByLabelText('Conversation'), {
      target: { value: '[9:00 AM] Maya: Alex, please send the brief by Friday\n[9:02 AM] Sam: Sam, please prepare slides by Wednesday' },
    })
    await user.click(screen.getByRole('button', { name: 'Analyze conversation' }))
    expect(fetch).not.toHaveBeenCalled()
    expect(screen.getByText(/sent to Google’s Gemini API/)).toBeTruthy()
    await acceptGeminiConsent(user)

    expect((await screen.findAllByText('2 messages', { exact: true })).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Send brief').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Prepare slides').length).toBeGreaterThan(0)
    await user.click(screen.getAllByRole('button', { name: /Send brief/ })[0])
    expect(await screen.findByText('SOURCE MESSAGE')).toBeTruthy()
    expect(screen.getAllByText('Alex, please send the brief by Friday').length).toBeGreaterThan(0)
  })

  it('imports a valid TXT, shows the parsed preview, then analyzes it after consent', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    await user.click(screen.getByRole('button', { name: 'Try sample conversation' }))
    await acceptGeminiConsent(user)
    expect((await screen.findAllByText('DEMO', { exact: true })).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Import conversation' }))
    expect(screen.queryByText('DEMO', { exact: true })).toBeNull()
    expect(container.querySelectorAll('.stat-card')).toHaveLength(0)
    const fileInput = container.querySelector('input[type="file"]')
    expect(fileInput).toBeTruthy()
    const chat = new File(['[9:00 AM] Maya: Alex, please review the launch plan by Friday'], 'chat.txt', { type: 'text/plain' })
    await user.upload(fileInput as HTMLInputElement, chat)

    expect(await screen.findByText('1 message ready to analyze')).toBeTruthy()
    await user.clear(screen.getByLabelText(/Your name/))
    await user.type(screen.getByLabelText(/Your name/), 'Alex')
    await user.click(screen.getByRole('button', { name: 'Analyze conversation' }))
    await acceptGeminiConsent(user)
    expect((await screen.findAllByText('Review launch plan')).length).toBeGreaterThan(0)
  })

  it('rejects malformed and unsupported TXT imports with a useful error', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(fileInput, new File([''], 'empty.txt', { type: 'text/plain' }))
    expect((await screen.findByRole('alert')).textContent).toContain('file is empty')
    await user.upload(fileInput, new File(['just some text without chat formatting'], 'notes.txt', { type: 'text/plain' }))
    expect((await screen.findByRole('alert')).textContent).toContain('couldn’t find recognizable chat messages')
    fireEvent.change(fileInput, { target: { files: [new File(['data'], 'notes.csv', { type: 'text/csv' })] } })
    expect((await screen.findByRole('alert')).textContent).toContain('file type isn’t supported')
  })

  it('clears a session back to the genuine empty state', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Try sample conversation' }))
    await acceptGeminiConsent(user)
    expect((await screen.findAllByText('DEMO', { exact: true })).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Clear session' }))

    expect(screen.getByText('No conversation analyzed yet.')).toBeTruthy()
    expect(screen.queryByText('DEMO', { exact: true })).toBeNull()
    expect(screen.queryByText('49 messages', { exact: true })).toBeNull()
    expect(screen.queryByText('Alex')).toBeNull()
  })

  it('filters results and lets the user mark a task completed', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    await user.type(screen.getByLabelText(/Your name/), 'Alex')
    fireEvent.change(screen.getByLabelText('Conversation'), {
      target: { value: '[9:00 AM] Maya: Alex, please review the launch plan by today\n[9:01 AM] Maya: Alex, please send the launch notes by Friday' },
    })
    await user.click(screen.getByRole('button', { name: 'Analyze conversation' }))
    await acceptGeminiConsent(user)
    await screen.findAllByText('Review launch plan')

    expect(container.querySelector('.insight-row')?.textContent).toContain('Review launch plan')
    await user.click(screen.getByRole('button', { name: 'Sort by deadline' }))
    expect(container.querySelector('.insight-row')?.textContent).toContain('Send launch notes')
    await user.click(screen.getByRole('button', { name: 'Sort by priority' }))
    expect(container.querySelector('.insight-row')?.textContent).toContain('Review launch plan')

    await user.click(screen.getByRole('tab', { name: /Urgent/ }))
    expect(container.querySelector('.items-list')?.textContent).toContain('Review launch plan')
    expect(container.querySelector('.items-list')?.textContent).not.toContain('Send launch notes')

    await user.click(screen.getByRole('tab', { name: 'All updates' }))
    await user.click(screen.getByRole('checkbox', { name: 'Mark Review launch plan complete' }))
    await user.click(screen.getByRole('tab', { name: 'Completed' }))
    expect(container.querySelector('.items-list')?.textContent).toContain('Review launch plan')
    expect(screen.getAllByText(/Marked complete by you/).length).toBeGreaterThan(0)
    expect(screen.getByText('YOUR OPEN TASKS').parentElement?.textContent).toContain('1')
    await user.click(screen.getByRole('checkbox', { name: 'Reopen Review launch plan task' }))
    await user.click(screen.getByRole('tab', { name: 'My tasks' }))
    expect(container.querySelector('.items-list')?.textContent).toContain('Review launch plan')
  })

  it('marks only the explicitly selected sample as demo data', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(screen.queryByText('DEMO', { exact: true })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Try sample conversation' }))
    await acceptGeminiConsent(user)
    expect((await screen.findAllByText('DEMO', { exact: true })).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('49 messages', { exact: true })).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('tab', { name: 'Decisions' }))
    const decisionResults = screen.getByRole('tablist', { name: 'Filter conversation insights' }).parentElement?.querySelector('.items-list')
    expect(decisionResults?.textContent).toContain('use Supabase instead for the first release')
    expect(decisionResults?.textContent).toContain('Friday for the beta launch')
    expect(decisionResults?.textContent).not.toContain('Maybe Firebase would be quickest')
  })

  it('shows actual low-priority source messages in See all and returns to the prior filter', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    fireEvent.change(screen.getByLabelText('Conversation'), {
      target: { value: '[9:00 AM] Jordan: Coffee after the demo?\n[9:01 AM] Sam: Playlist sounds good' },
    })
    await user.click(screen.getByRole('button', { name: 'Analyze conversation' }))
    await acceptGeminiConsent(user)
    await screen.findByText('2 messages', { exact: true })
    await user.click(screen.getByRole('button', { name: 'See all' }))

    expect(container.querySelector('.items-list')?.textContent).toContain('Coffee after the demo?')
    expect(container.querySelector('.items-list')?.textContent).toContain('Playlist sounds good')
    await user.click(screen.getByRole('button', { name: 'Back to previous view' }))
    expect(container.querySelector('.items-list')?.textContent).not.toContain('Coffee after the demo?')
  })

  it('shows WhatsApp instructions before redirect and imports selected TXT through the existing analyzer', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    const openWindow = vi.spyOn(window, 'open').mockReturnValue(null)
    await user.click(screen.getByRole('button', { name: 'Import from WhatsApp' }))

    expect(openWindow).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Import a WhatsApp chat' })).toBeTruthy()
    expect(screen.getByText((_, element) =>
      element?.tagName === 'LI' && Boolean(element.textContent?.includes('provide the export as a ZIP file')),
    )).toBeTruthy()
    expect(screen.getByText((_, element) =>
      element?.tagName === 'LI' && Boolean(element.textContent?.includes('Availability and steps vary by device and version')),
    )).toBeTruthy()
    expect(screen.getByText(/cannot read chats from the WhatsApp website/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Redirect to WhatsApp Web' }))
    expect(openWindow).toHaveBeenCalledWith('https://web.whatsapp.com/', '_blank', 'noopener,noreferrer')

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(fileInput, new File(['[9:00 AM] Jo: Taylor, please send launch notes by Friday'], 'whatsapp-export.txt', { type: 'text/plain' }))
    expect(await screen.findByText('1 message ready to analyze')).toBeTruthy()
    await user.type(screen.getByLabelText(/Your name/), 'Taylor')
    await user.click(screen.getByRole('button', { name: 'Analyze conversation' }))
    await acceptGeminiConsent(user)
    expect((await screen.findAllByText('Send launch notes')).length).toBeGreaterThan(0)
  })

  it('summarizes the demo and updates the summary for a different conversation', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    await user.click(screen.getByRole('button', { name: 'Try sample conversation' }))
    await acceptGeminiConsent(user)
    const demoSummary = await screen.findByText(/Across 49 messages/)
    const initialSummary = demoSummary.textContent

    await user.click(screen.getByRole('button', { name: 'Import conversation' }))
    fireEvent.change(screen.getByLabelText('Conversation'), {
      target: { value: '[9:00 AM] Kim: The garden irrigation sensors are online\n[9:01 AM] Pat: The greenhouse tomato harvest starts Monday' },
    })
    await user.click(screen.getByRole('button', { name: 'Analyze conversation' }))
    await acceptGeminiConsent(user)
    await screen.findByText(/Across 2 messages/)

    const updatedSummary = container.querySelector('.conversation-summary p')?.textContent
    expect(updatedSummary).not.toBe(initialSummary)
    expect(updatedSummary).toContain('greenhouse')
    expect(updatedSummary).not.toContain('supabase')
  })

  it('does not extract tasks, decisions, or deadlines from casual use of urgent wording', async () => {
    const user = userEvent.setup()
    render(<App />)
    fireEvent.change(screen.getByLabelText('Conversation'), {
      target: { value: '[9:00 AM] Maya: This urgent playlist is excellent\n[9:01 AM] Sam: Lunch order?' },
    })
    await user.click(screen.getByRole('button', { name: 'Analyze conversation' }))
    await acceptGeminiConsent(user)

    expect(await screen.findByText('No name was provided, so personal task ownership is not inferred.')).toBeTruthy()
    expect(screen.getByText('OPEN TASKS')).toBeTruthy()
    expect(screen.queryByText('DECISION')).toBeNull()
    expect(screen.getAllByText('0').length).toBeGreaterThan(0)
  })

  it('shows Gemini API errors without falling back to local or placeholder results', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: 'Gemini is not configured yet. Set GEMINI_API_KEY on the server and restart it.' }),
    })))
    render(<App />)
    fireEvent.change(screen.getByLabelText('Conversation'), {
      target: { value: '[9:00 AM] Maya: Alex, please send the brief by Friday' },
    })
    await user.click(screen.getByRole('button', { name: 'Analyze conversation' }))
    await acceptGeminiConsent(user)

    expect((await screen.findByRole('alert')).textContent).toMatch(/Set GEMINI_API_KEY/)
    expect(screen.queryByText(/THE QUICK RECAP/)).toBeNull()
    expect(screen.getByText('No conversation analyzed yet.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Analyze conversation' })).toBeTruthy()
  })

  it('shows quota failures as retryable Gemini errors and does not invent results', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: 'Google Gemini reports a rate limit or exhausted quota. Check your AI Studio model quota/billing, then retry.' }),
    })))
    render(<App />)
    fireEvent.change(screen.getByLabelText('Conversation'), {
      target: { value: '[9:00 AM] Jo: Please send the project notes by Friday' },
    })
    await user.click(screen.getByRole('button', { name: 'Analyze conversation' }))
    await acceptGeminiConsent(user)

    expect((await screen.findByRole('alert')).textContent).toMatch(/rate limit or exhausted quota/)
    expect(screen.queryByText(/THE QUICK RECAP/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Analyze conversation' })).toBeTruthy()
  })

  it('keeps the session cleared when an in-flight analysis response arrives later', async () => {
    const user = userEvent.setup()
    let resolveResponse: ((value: { ok: boolean; json: () => Promise<ReturnType<typeof analyzeConversation>> }) => void) | undefined
    const pendingResponse = new Promise<{ ok: boolean; json: () => Promise<ReturnType<typeof analyzeConversation>> }>((resolve) => {
      resolveResponse = resolve
    })
    vi.stubGlobal('fetch', vi.fn(() => pendingResponse))
    render(<App />)
    const input = '[9:00 AM] Maya: Alex, please send the brief by Friday'
    fireEvent.change(screen.getByLabelText('Conversation'), { target: { value: input } })
    await user.click(screen.getByRole('button', { name: 'Analyze conversation' }))
    await acceptGeminiConsent(user)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: 'Clear session' }))
    resolveResponse?.({
      ok: true,
      json: async () => analyzeConversation(
        [{ id: 'message-1', sender: 'Maya', timestamp: '9:00 AM', text: 'Alex, please send the brief by Friday', order: 0 }],
        'Alex',
      ),
    })
    await waitFor(() => expect(screen.getByText('No conversation analyzed yet.')).toBeTruthy())
    expect(screen.queryByText('THE QUICK RECAP')).toBeNull()
    expect((screen.getByLabelText('Conversation') as HTMLTextAreaElement).value).toBe('')
  })
})
