import { Router, Request, Response } from 'express';
import { runCode } from '../execution/runner';

export const executeRouter = Router();

executeRouter.post('/', async (req: Request, res: Response) => {
  const { code, language, roomId } = req.body;

  if (!code || !language) {
    return res.status(400).json({ error: 'code and language are required' });
  }

  if (!['python', 'javascript', 'typescript'].includes(language)) {
    return res.status(400).json({ error: 'Unsupported language' });
  }

  if (code.length > 50_000) {
    return res.status(400).json({ error: 'Code too large' });
  }

  try {
    const result = await runCode(language, code);
    return res.json(result);
  } catch (err: any) {
    if (err.message === 'TIMEOUT') {
      return res.status(408).json({ stdout: '', stderr: 'Execution timed out (5s limit)', exitCode: -1, durationMs: 5000 });
    }
    console.error('[execute] error', err);
    return res.status(500).json({ error: 'Execution failed' });
  }
});