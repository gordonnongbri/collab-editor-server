import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './db';

dotenv.config();

const app = express();

app.use(cors({
  origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'
}));


const server = http.createServer(app);

const PORT = process.env.PORT ?? 3001;

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on :${PORT}`);
  });
});