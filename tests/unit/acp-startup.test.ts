import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { AcpAgentClient } from "@codeteams/acp";

test("ACP startup errors include redacted adapter stderr", async () => {
  const secret = "startup-test-private-value";
  const client = new AcpAgentClient({
    command: process.execPath,
    args: ["-e", `console.error('npm error ENOENT package.json ${secret}'); process.exit(1);`],
    cwd: process.cwd(),
    knownSecrets: [secret],
  });
  try {
    await client.connect();
    throw new Error("Expected the adapter to fail");
  } catch (error) {
    expect((error as Error).message).toContain("ENOENT package.json");
    expect((error as Error).message).toContain("[REDACTED]");
    expect((error as Error).message).not.toContain(secret);
  } finally {
    await client.close();
  }
});

test("ACP initialize timeout preserves timeout code and stderr", async () => {
  const client = new AcpAgentClient({
    command: process.execPath,
    args: ["-e", "console.error('Downloading adapter binary'); setInterval(() => {}, 1000);"],
    cwd: process.cwd(),
    initTimeoutMs: 500,
  });
  try {
    await client.connect();
    throw new Error("Expected timeout");
  } catch (error) {
    expect((error as { code: string }).code).toBe("TIMEOUT");
    expect((error as Error).message).toContain("Downloading adapter binary");
  } finally {
    await client.close();
  }
});

test("failed initialization clears its long timeout so the host can exit", async () => {
  const modulePath = resolve("packages/acp/src/client.ts");
  const child = Bun.spawn([process.execPath, "-e", `
    import { AcpAgentClient } from ${JSON.stringify(modulePath)};
    const client = new AcpAgentClient({ command: process.execPath,
      args: ['-e', 'process.exit(1)'], cwd: process.cwd(), initTimeoutMs: 60000 });
    try { await client.connect(); } catch {} finally { await client.close(); }
  `], { stdout: "ignore", stderr: "pipe", timeout: 3000 });
  expect(await child.exited).toBe(0);
});
