import 'dotenv/config'
import express from 'express'
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'

const app = express()
const port = Number(process.env.QUESTLIST_API_PORT || 8787)
const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'

app.disable('x-powered-by')
app.use(express.json({ limit: '16kb' }))

const requestSchema = z.object({
  goal: z.string().trim().min(2).max(500),
  availableMinutes: z.number().int().min(10).max(240),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict()

const taskSchema = z.object({
  title: z.string().trim().min(3).max(140),
  minutes: z.number().int().min(5).max(180),
  points: z.number().int().min(5).max(25),
}).strict()

const planSchema = z.object({
  tasks: z.array(taskSchema).min(4).max(12),
}).strict()

const requestsByAddress = new Map()
const WINDOW_MS = 60_000
const MAX_REQUESTS = 10

function allowRequest(address) {
  const now = Date.now()
  const recent = (requestsByAddress.get(address) || []).filter(time => now - time < WINDOW_MS)
  if (recent.length >= MAX_REQUESTS) return false
  recent.push(now)
  requestsByAddress.set(address, recent)
  return true
}

app.post('/api/plan', async (req, res) => {
  if (!allowRequest(req.ip || 'local')) return res.status(429).json({ error: 'Please wait a moment before planning again.' })

  const parsed = requestSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Please provide a valid goal, available time, and deadline.' })
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'AI planning is not configured.', code: 'AI_NOT_CONFIGURED' })

  const { goal, availableMinutes, deadline } = parsed.data
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 20_000, maxRetries: 1 })
  const deadlineContext = deadline ? `The user wants to finish by ${deadline}.` : 'There is no fixed deadline.'

  try {
    const response = await client.responses.parse({
      model,
      input: [
        {
          role: 'system',
          content: `You are a practical planning assistant. Turn a broad goal into an ordered, ready-to-follow plan of 4-12 concrete tasks. Each task must begin with a specific action verb, be independently completable, and be small enough for one or a few focus sessions. Avoid meta-steps like "think about it" and avoid generic placeholders. Use the user's exact subject and context. Estimate realistic minutes in increments of 5. Assign 5 points for a quick/easy step, 10 for moderate work, 15-20 for substantial work, and 25 only for the hardest step. Fit the sequence to the user's available session length and deadline.`,
        },
        {
          role: 'user',
          content: `Goal: ${goal}\nAvailable time per sitting: ${availableMinutes} minutes\n${deadlineContext}`,
        },
      ],
      text: { format: zodTextFormat(planSchema, 'quest_plan') },
    })

    const validated = planSchema.safeParse(response.output_parsed)
    if (!validated.success) throw new Error('Model returned an invalid plan')
    return res.json({ source: 'ai', tasks: validated.data.tasks })
  } catch (error) {
    console.error('AI planning request failed:', error instanceof Error ? error.message : 'Unknown error')
    return res.status(502).json({ error: 'AI planning is temporarily unavailable.' })
  }
})

app.get('/api/health', (_req, res) => res.json({ ok: true, aiConfigured: Boolean(process.env.OPENAI_API_KEY) }))

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON request.' })
  console.error('Server error:', error instanceof Error ? error.message : 'Unknown error')
  return res.status(500).json({ error: 'Unexpected server error.' })
})

app.listen(port, '127.0.0.1', () => {
  console.log(`QuestList API ready at http://127.0.0.1:${port}`)
  console.log(process.env.OPENAI_API_KEY ? `AI planning enabled (${model})` : 'AI planning not configured; the app will use its labeled offline fallback')
})
