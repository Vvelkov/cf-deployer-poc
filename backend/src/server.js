import express from 'express'
import { registerRoutes } from './routes.js'

export const app = express()
app.use(express.json())

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

registerRoutes(app)

// Express 4 does not catch errors thrown in async handlers. Log them instead of letting
// Node.js terminate the whole backend (and lose the in-memory deployment list).
process.on('unhandledRejection', (err) => console.error('unhandled rejection:', err))

if (process.env.NODE_ENV !== 'test') {
  app.listen(3001, () => console.log('backend on :3001'))
}
