import express from 'express'
import { registerRoutes } from './routes.js'

export const app = express()
app.use(express.json())

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

registerRoutes(app)

if (process.env.NODE_ENV !== 'test') {
  app.listen(3001, () => console.log('backend on :3001'))
}
