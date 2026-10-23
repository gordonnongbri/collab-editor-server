import Docker from 'dockerode';

const docker = new Docker();

const IMAGES: Record<string, string> = {
  python:     'python:3.12-alpine',
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
      return ['sh', '-c', `echo ${JSON.stringify(code)} | npx --yes ts-node --stdin --skipProject`];
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

  const container = await docker.createContainer({
    Image: IMAGES[language],
    Cmd: buildCmd(language, code),
    NetworkDisabled: true,
    User: 'nobody',
    HostConfig: {
      ReadonlyRootfs: true,
      Memory:      128 * 1024 * 1024,
      MemorySwap:  128 * 1024 * 1024,
      NanoCpus:    500_000_000,
      PidsLimit:   32,
      AutoRemove:  true,
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
  const stream = await container.logs({ stdout: true, stderr: true, follow: true });
  let stdout = '';
  let stderr = '';

  return new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
    (stream as NodeJS.ReadableStream).on('data', (chunk: Buffer) => {
      // Docker log stream: byte 0 = stream type (1=stdout, 2=stderr), bytes 1-7 = length
      const type = chunk[0];
      const text = chunk.slice(8).toString('utf8');
      if (type === 1) stdout += text;
      else            stderr += text;
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
