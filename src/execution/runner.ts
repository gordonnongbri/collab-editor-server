import Docker from 'dockerode';

const docker = new Docker();

const IMAGES: Record<string, string> = {
  python: 'python:3.12-alpine',
  javascript: 'node:20-alpine',
  typescript: 'node:20-alpine',
};

function buildCmd(language: string, code: string): string[] {
  switch (language) {
    case 'python':
      return ['python', '-c', code];
    case 'javascript':
      return ['node', '-e', code];
    case 'typescript':
      return ['sh', '-c', `echo ${JSON.stringify(code)} | npx ts-node --stdin`];
    default:
      throw new Error(`Unknown language: ${language}`);
  }
}

export async function runCode(
  language: string,
  code: string,
  timeoutMs = 5000
): Promise<{ stdout: string; stderr: string; exitCode: number; durationMs: number }> {
  const start = Date.now();
  const image = IMAGES[language];

  const container = await docker.createContainer({
    Image: image,
    Cmd: buildCmd(language, code),
    NetworkDisabled: true,         // no network
    ReadonlyRootfs: true,
    User: 'nobody',                // non-root
    HostConfig: {
      Memory: 128 * 1024 * 1024,  // 128 MB
      MemorySwap: 128 * 1024 * 1024,
      NanoCpus: 500_000_000,      // 0.5 vCPU
      PidsLimit: 32,              // fork bomb prevention
      AutoRemove: true,
      SecurityOpt: ['no-new-privileges'],
    },
  });

  await container.start();

  const output = await Promise.race([
    collectLogs(container),
    new Promise<never>((_, reject) =>
      setTimeout(() => {
        container.kill().catch(() => {});
        reject(new Error('TIMEOUT'));
      }, timeoutMs)
    ),
  ]);

  return { ...output, durationMs: Date.now() - start };
}

async function collectLogs(container: Docker.Container) {
  const stream = await container.logs({
    stdout: true, stderr: true, follow: true,
  });

  let stdout = '';
  let stderr = '';

  return new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
    (stream as NodeJS.ReadableStream).on('data', (chunk: Buffer) => {
      const type = chunk[0];
      const text = chunk.slice(8).toString('utf8');
      if (type === 1) stdout += text;
      else stderr += text;
    });

    (stream as NodeJS.ReadableStream).on('end', async () => {
      try {
        const info = await container.inspect();
        resolve({ stdout, stderr, exitCode: info.State.ExitCode });
      } catch {
        resolve({ stdout, stderr, exitCode: -1 });
      }
    });
  });
}