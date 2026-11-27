import { randomUUID } from "node:crypto";
import { CodeTeamsStorage, messagesTable } from "@codeteams/storage";
import { CodeTeamsRuntime } from "@codeteams/engine";

const [dataDir, projectDir] = process.argv.slice(2);
if (!dataDir || !projectDir) throw new Error("Expected isolated data and project directories.");
const storage = new CodeTeamsStorage(dataDir);
const runtime = new CodeTeamsRuntime(storage);
const project = runtime.openProject(projectDir);
const long = runtime.createConversation({ projectId: project.id, title: "对话定位测试", mode: "single", agentId: "codex" });
const single = runtime.createConversation({ projectId: project.id, title: "单轮对话", mode: "single", agentId: "codex" });
const empty = runtime.createConversation({ projectId: project.id, title: "空对话", mode: "single", agentId: "codex" });
for (const [conversation, count] of [[long, 8], [single, 1]] as const) {
  for (let turn = 0; turn < count; turn++) {
    for (const role of ["user", "assistant"] as const) {
      storage.db.insert(messagesTable).values({
        id: randomUUID(), conversationId: conversation.id, role, kind: "text",
        agentId: role === "assistant" ? "codex" : null,
        seq: turn * 2 + (role === "user" ? 1 : 2),
        content: role === "user" ? `问题 ${turn + 1}：梳理项目架构与实现步骤。`
          : Array.from({ length: 14 }, (_, line) => `第 ${turn + 1} 轮的说明 ${line + 1}：保持界面清晰，并验证代码、权限与上下文处理。`).join("\n\n"),
        createdAt: new Date().toISOString(),
      }).run();
    }
  }
}
const monochrome = runtime.createConversation({ projectId: project.id, title: "查看当前的项目", mode: "single", agentId: "codex" });
const intro = "启动方式见 [README.md](https://example.invalid/README.md)：运行 `uv run evalweave --config config/application.yaml`。\n\n我会核对仓库状态、测试配置和关键调用链。";
const summary = "当前项目主要包括：\n\n- **后端**：FastAPI、SQLModel、Celery + Redis。\n- **核心代码**：`src/evalweave/`；前端页面：`web/src/views/`；测试：`tests/`。\n- **分支**：`main`，提交 `c42b39aa1e10`。\n\n```typescript\nexport const review = { status: 'ready' };\n```";
storage.db.insert(messagesTable).values({ id: randomUUID(), conversationId: monochrome.id, role: "user", seq: 1, kind: "text", content: "查看当前的项目", createdAt: new Date().toISOString() }).run();
storage.db.insert(messagesTable).values({
  id: randomUUID(), conversationId: monochrome.id, role: "assistant", agentId: "codex", seq: 2, kind: "text", content: `${intro}\n\n${summary}`, createdAt: new Date().toISOString(),
  metadataJson: JSON.stringify({ segments: [
    { type: "text", text: intro },
    ...[
      ["Get-Location; git status --short; rg --files -g AGENTS.md -g package.json", "execute", "failed"],
      ["mcp.node_repl.js", "execute", "failed"], ["Guardian Review", "think", "completed"],
    ].map(([title, kind, status], index) => ({ type: "tool", toolCallId: `preview-${index}`, title, kind, status, locations: [], rawInputPreview: title, rawOutputPreview: status === "failed" ? "Windows process startup error 1385" : "Review complete", contentPreview: null })),
    { type: "text", text: summary },
  ] }),
}).run();
console.log(JSON.stringify({ long: long.id, single: single.id, empty: empty.id, monochrome: monochrome.id }));
await runtime.shutdown();
