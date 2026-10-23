import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './db';
import { executeRouter } from './routes/execute';

dotenv.config();

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));

app.use('/api/execute', executeRouter);
app.get('/api/health', (_, res) => res.json({ ok: true, ts: Date.now() }));

const server = http.createServer(app);

const PORT = process.env.PORT ?? 3001;

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`[server] HTTP API running on http://localhost:${PORT}`);
    console.log(`[server] Start the Yjs WS server separately: npm run dev:yjs`);
  });
}).catch((err) => {
  console.error('[server] Failed to connect to MongoDB:', err);
  process.exit(1);
});
