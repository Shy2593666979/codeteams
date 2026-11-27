import { homedir } from "node:os";
import { join } from "node:path";
import { CodeTeamsStorage } from "@codeteams/storage";
import { CodeTeamsRuntime } from "@codeteams/engine";
import { CoreRpcServer, logStderr } from "./rpc-server";

function resolveUserDataDir(): string {
  const argIdx = process.argv.indexOf("--user-data-dir");
  if (argIdx !== -1 && process.argv[argIdx + 1]) {
    return process.argv[argIdx + 1]!;
  }
  if (process.env.CODETEAMS_USER_DATA_DIR) {
    return process.env.CODETEAMS_USER_DATA_DIR;
  }
  return join(homedir(), ".codeteams");
}

async function main() {
  const userDataDir = resolveUserDataDir();
  logStderr("info", "Starting CodeTeams Bun Core", {
    userDataDir,
    bunVersion: Bun.version,
    pid: process.pid,
  });

  const storage = new CodeTeamsStorage(userDataDir);
  const runtime = new CodeTeamsRuntime(storage);
  const server = new CoreRpcServer(runtime);

  const handleSignal = () => {
    logStderr("info", "Received shutdown signal, cleaning up Core...");
    void runtime.shutdown().finally(() => process.exit(0));
  };

  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);

  await server.serveStdio();
}

main().catch((err) => {
  logStderr("error", "Fatal error in CodeTeams Core", {
    error: err instanceof Error ? err.stack ?? err.message : String(err),
  });
  process.exit(1);
});
