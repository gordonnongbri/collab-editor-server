import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { initSocketServer } from './socket/gateway';
import { connectDB } from './db';
import { executeRouter } from './routes/execute';

dotenv.config();

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));

app.use('/api/execute', executeRouter);

app.get('/api/health', (_, res) => res.json({ ok: true }));

const server = http.createServer(app);
initSocketServer(server);

const PORT = process.env.PORT ?? 3001;

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on :${PORT}`);
  });
});