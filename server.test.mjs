import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppServer, generateWithGemini, GEMINI_MODEL } from './server.mjs'

const servers = []

async function withServer(options, run) {
  const server = createAppServer(options)
  servers.push(server)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  await run(`http://127.0.0.1:${address.port}`)
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))))
  vi.unstubAllEnvs()
})

function modelResponse(sourceId = 'message-1') {
  const task = {
    title: 'Send launch notes',
    status: 'pending',
    priority: 'medium',
    owner: 'Taylor',
    deadline: 'Friday',
    reason: 'Taylor was assigned this task with a stated deadline.',
    sourceIds: [sourceId],
  }
  return JSON.stringify({
    summary: 'Taylor needs to send launch notes by Friday.',
    conversationSummary: 'The conversation is about a launch and its notes.',
    tasks: [task],
    completed: [],
    decisions: [],
    mentions: [],
    updates: [],
    safeToSkip: [],
  })
}

describe('Gemini analysis API', () => {
  it('uses the official SDK with the configured model, server key, and JSON schema', async () => {
    const text = JSON.stringify({
      summary: 'A concise summary',
      conversationSummary: 'A conversation overview',
      tasks: [],
      completed: [],
      decisions: [],
      mentions: [],
      updates: [],
      safeToSkip: [],
    })
    const sdkFetch = vi.fn(async (_url, _init) => new Response(JSON.stringify({
      id: 'test-interaction',
      status: 'completed',
      output_text: text,
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    await expect(generateWithGemini(
      [{ id: 'message-1', sender: 'Jo', timestamp: '', text: 'The actual chat message', order: 0 }],
      'Taylor',
      '',
      'unit-test-not-a-secret',
      sdkFetch,
    )).resolves.toBe(text)
    expect(sdkFetch).toHaveBeenCalledTimes(1)
    const [request] = sdkFetch.mock.calls[0]
    expect(request.url).toContain('/interactions')
    expect(request.headers.get('x-goog-api-key')).toBe('unit-test-not-a-secret')
    const requestBody = JSON.parse(await request.clone().text())
    expect(requestBody.model).toBe(GEMINI_MODEL)
    expect(requestBody.store).toBe(false)
    expect(requestBody.response_format.schema).toBeTruthy()
    expect(requestBody.input).toContain('The actual chat message')
  })

  it('aborts a stalled SDK request at the configured timeout', async () => {
    const sdkFetch = vi.fn((_request, init) => new Promise((_resolve, reject) => {
      if (init.signal.aborted) {
        const error = new Error('request timed out')
        error.name = 'TimeoutError'
        reject(error)
        return
      }
      init.signal.addEventListener('abort', () => {
        const error = new Error('request timed out')
        error.name = 'TimeoutError'
        reject(error)
      }, { once: true })
    }))

    await expect(generateWithGemini(
      [{ id: 'message-1', sender: 'Jo', timestamp: '', text: 'Hello', order: 0 }],
      '',
      '',
      'unit-test-not-a-secret',
      sdkFetch,
      10,
    )).rejects.toMatchObject({ name: 'APIConnectionTimeoutError' })
    expect(sdkFetch).toHaveBeenCalledTimes(1)
  })

  it('retries once when Gemini returns a transient server error', async () => {
    const text = JSON.stringify({
      summary: 'A concise summary',
      conversationSummary: 'A conversation overview',
      tasks: [],
      completed: [],
      decisions: [],
      mentions: [],
      updates: [],
      safeToSkip: [],
    })
    const sdkFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: 503, message: 'Service unavailable', status: 'UNAVAILABLE' },
      }), { status: 503, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'test-interaction',
        status: 'completed',
        output_text: text,
      }), { status: 200, headers: { 'content-type': 'application/json' } }))

    await expect(generateWithGemini(
      [{ id: 'message-1', sender: 'Jo', timestamp: '', text: 'Hello', order: 0 }],
      '',
      '',
      'unit-test-not-a-secret',
      sdkFetch,
    )).resolves.toBe(text)
    expect(sdkFetch).toHaveBeenCalledTimes(2)
  })

  it('sends validated messages to the configured generator and derives dashboard metrics', async () => {
    const generate = vi.fn(async (_messages, _name, _role, apiKey) => {
      expect(apiKey).toBe('server-test-key')
      return modelResponse()
    })
    vi.stubEnv('GEMINI_API_KEY', 'server-test-key')
    const messages = [{
      id: 'message-1',
      sender: 'Jo',
      timestamp: '9:00 AM',
      text: 'Taylor, please send launch notes by Friday',
      order: 0,
    }]

    await withServer({ generate }, async (origin) => {
      const response = await fetch(`${origin}/api/analyze`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages, userName: 'Taylor', role: '' }),
      })
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(generate).toHaveBeenCalledWith(messages, 'Taylor', '', 'server-test-key')
      expect(result.summary).toContain('launch notes')
      expect(result.unreadCount).toBe(1)
      expect(result.myOpenTasks).toBe(1)
      expect(result.deadlineCount).toBe(1)
      expect(result.tasks[0].sourceIds).toEqual(['message-1'])
      expect(result.tasks[0].owner).toBe('Taylor')
    })
  })

  it('returns an actionable missing-key error without calling Gemini', async () => {
    const generate = vi.fn()
    await withServer({ apiKey: '', generate }, async (origin) => {
      const response = await fetch(`${origin}/api/analyze`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [{ id: 'message-1', sender: 'Jo', timestamp: '', text: 'Hello', order: 0 }], userName: '', role: '' }),
      })
      expect(response.status).toBe(503)
      expect((await response.json()).error).toMatch(/Set GEMINI_API_KEY/)
      expect(generate).not.toHaveBeenCalled()
    })
  })

  it('rejects malformed model responses and evidence IDs not present in the conversation', async () => {
    await withServer({ apiKey: 'test', generate: async () => modelResponse('invented-message') }, async (origin) => {
      const response = await fetch(`${origin}/api/analyze`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [{ id: 'message-1', sender: 'Jo', timestamp: '', text: 'Hello', order: 0 }], userName: '', role: '' }),
      })
      expect(response.status).toBe(502)
      expect((await response.json()).error).toMatch(/valid analysis/)
    })
  })

  it('returns a retryable gateway timeout when Gemini does not respond', async () => {
    await withServer({
      apiKey: 'test',
      generate: async () => {
        const error = new Error('request aborted')
        error.name = 'TimeoutError'
        throw error
      },
    }, async (origin) => {
      const response = await fetch(`${origin}/api/analyze`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [{ id: 'message-1', sender: 'Jo', timestamp: '', text: 'Hello', order: 0 }], userName: '', role: '' }),
      })
      expect(response.status).toBe(504)
      expect((await response.json()).error).toMatch(/try a shorter conversation/)
    })
  })

  it('explains the local option when Gemini remains temporarily unavailable', async () => {
    await withServer({
      apiKey: 'test',
      generate: async () => {
        const error = new Error('upstream unavailable')
        error.status = 503
        throw error
      },
    }, async (origin) => {
      const response = await fetch(`${origin}/api/analyze`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [{ id: 'message-1', sender: 'Jo', timestamp: '', text: 'Hello', order: 0 }], userName: '', role: '' }),
      })
      expect(response.status).toBe(502)
      expect((await response.json()).error).toMatch(/retried once.*choose Local rules/)
    })
  })

  it('exposes the configured supported model name in health checks', async () => {
    await withServer({ apiKey: 'test' }, async (origin) => {
      const response = await fetch(`${origin}/api/health`)
      expect(await response.json()).toEqual({ configured: true, model: GEMINI_MODEL })
    })
  })
})
