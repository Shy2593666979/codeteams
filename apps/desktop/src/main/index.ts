import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  Notification,
  session,
  shell,
  type IpcMainInvokeEvent,
} from "electron";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { RpcSchemas, type CoreEvent } from "@codeteams/shared";
import { CoreProcessBridge } from "./core-bridge";
import { loadOfficialAgentLogos } from "./logos";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string | undefined;

let mainWindow: BrowserWindow | null = null;
let coreBridge: CoreProcessBridge | null = null;
let isQuitting = false;
const activeNotifications = new Set<Notification>();
// Development runs must not share Explorer's cached group with the installed
// application (or older runs of the stock Electron executable).
const IS_PACKAGED_APP = app.isPackaged && process.env.CODETEAMS_DEV_EXECUTABLE !== "1";
const WINDOWS_APP_USER_MODEL_ID = IS_PACKAGED_APP
  ? "com.codeteams.desktop"
  : "com.codeteams.desktop.dev";

function registerWindowsAppUserModelId(): void {
  if (process.platform !== "win32") return;

  // Keep automated E2E runs isolated from the host Start Menu
  if (process.env.CODETEAMS_USER_DATA_DIR) {
    app.setAppUserModelId(WINDOWS_APP_USER_MODEL_ID);
    return;
  }

  let shortcutReady = false;
  try {
    const shortcutPath = join(
      app.getPath("appData"),
      "Microsoft",
      "Windows",
      "Start Menu",
      "Programs",
      "CodeTeams.lnk"
    );
    const iconPath = resolveAppIconPath();
    shortcutReady = shell.writeShortcutLink(
      shortcutPath,
      existsSync(shortcutPath) ? "replace" : "create",
      {
        target: process.execPath,
        args: IS_PACKAGED_APP ? "" : `"${app.getAppPath()}"`,
        cwd: IS_PACKAGED_APP ? dirname(process.execPath) : app.getAppPath(),
        appUserModelId: WINDOWS_APP_USER_MODEL_ID,
        description: "CodeTeams",
        ...(iconPath ? { icon: iconPath, iconIndex: 0 } : {}),
      }
    );
  } catch (err) {
    process.stderr.write(
      `[notify] Failed to register Windows Start Menu shortcut: ${err instanceof Error ? err.message : String(err)}\n`
    );
    shortcutReady = false;
  }

  // Windows 10/11 silently drops Toast Notifications if AUMID has no Start Menu .lnk shortcut.
  app.setAppUserModelId(WINDOWS_APP_USER_MODEL_ID);
  if (!shortcutReady) {
    process.stderr.write("[notify] CodeTeams shortcut registration failed; keeping the CodeTeams taskbar identity.\n");
  }
}

function resolveNotificationIconPath(): string | undefined {
  const candidates = [
    join(process.resourcesPath, "app-icon.png"),
    join(app.getAppPath(), "resources", "app-icon.png"),
    join(__dirname, "..", "..", "resources", "app-icon.png"),
    join(app.getAppPath(), "..", "..", "resources", "brand", "codeteams-logo.png"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return undefined;
}

function summarizeNotificationAction(
  toolTitle?: string | null,
  toolKind?: string | null
): string {
  const raw = (toolTitle ?? "").trim();
  if (raw && raw.length <= 64 && !raw.includes("\n")) {
    return raw;
  }
  const k = (toolKind ?? "").toLowerCase();
  if (k === "execute" || k === "command" || k === "shell" || k === "terminal") {
    return "执行终端命令";
  }
  if (k === "edit" || k === "write" || k === "move") return "编辑或写入文件";
  if (k === "delete") return "删除文件";
  if (k === "read") return "读取文件";
  if (k === "fetch") return "访问网络资源";
  return raw ? `${raw.replace(/\s+/g, " ").slice(0, 56)}…` : "执行工具操作";
}

function showDesktopNotification(params: {
  title: string;
  body: string;
  conversationId?: string;
}): void {
  if (isQuitting || !Notification.isSupported()) return;
  try {
    const icon = resolveNotificationIconPath();
    const notif = new Notification({
      title: params.title,
      body: params.body,
      ...(process.platform !== "win32" && icon ? { icon } : {}),
    });
    activeNotifications.add(notif);
    notif.on("click", () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        if (params.conversationId) {
          mainWindow.webContents.send(
            "codeteams:navigate",
            `/chat/${params.conversationId}`
          );
        }
      }
    });
    notif.on("failed", (_event, error) => {
      activeNotifications.delete(notif);
      process.stderr.write(`[notify] OS notification failed: ${error}\n`);
    });
    notif.on("close", () => {
      activeNotifications.delete(notif);
    });
    notif.show();

    if (
      mainWindow &&
      !mainWindow.isDestroyed() &&
      (!mainWindow.isFocused() || mainWindow.isMinimized())
    ) {
      mainWindow.flashFrame(true);
    }
  } catch {
    // Ignore OS notification errors in headless/restricted environments
  }
}

async function notifyConversationEvent(ev: CoreEvent): Promise<void> {
  if (ev.type === "permission.requested") {
    const p = (ev.payload ?? {}) as {
      agentId?: string;
      toolTitle?: string | null;
      toolKind?: string | null;
    };
    const action = summarizeNotificationAction(p.toolTitle, p.toolKind);
    const agentLabel = p.agentId || "Agent";
    showDesktopNotification({
      title: "需要你的批准",
      body: `${agentLabel} 请求授权：${action}`,
      conversationId: ev.conversationId,
    });
    return;
  }

  const isChatTerminal =
    ev.type === "chat.state" &&
    ((ev.payload as { state?: string } | null)?.state === "completed" ||
      (ev.payload as { state?: string } | null)?.state === "failed");
  const isRunTerminal =
    ev.type === "run.state" &&
    ((ev.payload as { state?: string } | null)?.state === "completed" ||
      (ev.payload as { state?: string } | null)?.state === "failed");

  if (!isChatTerminal && !isRunTerminal) return;

  // Notify on completion/failure when main window is in background or minimized
  const windowFocused = Boolean(
    mainWindow &&
      !mainWindow.isDestroyed() &&
      mainWindow.isFocused() &&
      !mainWindow.isMinimized()
  );
  if (windowFocused) return;

  const state = (ev.payload as { state?: string } | null)?.state;
  let titleText = "当前对话";
  if (ev.conversationId && coreBridge) {
    try {
      const detail = (await coreBridge.call(
        "conversations.get",
        { conversationId: ev.conversationId },
        2000
      )) as { conversation?: { title?: string } };
      if (detail?.conversation?.title) {
        titleText = detail.conversation.title;
      }
    } catch {
      // Fallback to default label
    }
  }

  showDesktopNotification({
    title: state === "completed" ? "任务已完成" : "任务执行失败",
    body: titleText,
    conversationId: ev.conversationId,
  });
}

function getUserDataDir(): string {
  return process.env.CODETEAMS_USER_DATA_DIR || app.getPath("userData");
}

function assertAuthorizedSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? "";
  if (
    url.startsWith("file://") ||
    url.startsWith("http://localhost:") ||
    url.startsWith("http://127.0.0.1:")
  ) {
    return;
  }
  throw new Error(`Unauthorized IPC sender origin: ${url}`);
}

function resolveAppIconPath(): string | undefined {
  const candidates =
    process.platform === "win32"
      ? [
          join(process.resourcesPath, "app-icon.ico"),
          join(app.getAppPath(), "resources", "app-icon.ico"),
          join(__dirname, "..", "..", "resources", "app-icon.ico"),
          join(process.resourcesPath, "app-icon.png"),
          join(app.getAppPath(), "resources", "app-icon.png"),
          join(__dirname, "..", "..", "resources", "app-icon.png"),
          join(app.getAppPath(), "..", "..", "resources", "brand", "codeteams-logo.png"),
        ]
      : [
          join(process.resourcesPath, "app-icon.png"),
          join(app.getAppPath(), "resources", "app-icon.png"),
          join(__dirname, "..", "..", "resources", "app-icon.png"),
          join(app.getAppPath(), "..", "..", "resources", "brand", "codeteams-logo.png"),
        ];
  for (const p of candidates) {
    if (existsSync(p)) {
      if (process.platform !== "win32") return p;
      // Explorer caches icons by path. A content-specific name refreshes the
      // shortcut and taskbar when the design changes without clearing OS caches.
      try {
        const bytes = readFileSync(p);
        const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
        const iconDir = join(getUserDataDir(), "icons");
        const cachedPath = join(iconDir, `codeteams-${digest}.${p.endsWith(".ico") ? "ico" : "png"}`);
        mkdirSync(iconDir, { recursive: true });
        if (!existsSync(cachedPath)) writeFileSync(cachedPath, bytes);
        return cachedPath;
      } catch (err) {
        process.stderr.write(`[icon] Unable to cache taskbar icon: ${String(err)}\n`);
        return p;
      }
    }
  }
  return undefined;
}

async function createMainWindow(): Promise<BrowserWindow> {
  const preloadPath = join(__dirname, "preload.js");
  const appIconPath = resolveAppIconPath();

  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "CodeTeams",
    show: false,
    icon: appIconPath,
    backgroundColor: "#ffffff",
    autoHideMenuBar: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    ...(process.platform !== "darwin"
      ? {
          titleBarOverlay: {
            color: "#00000000",
            symbolColor: "#475569",
            height: 48,
          },
        }
      : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  if (process.platform !== "darwin") {
    win.setMenuBarVisibility(false);
    win.removeMenu();
    if (appIconPath) {
      win.setIcon(appIconPath);
    }
  }
  if (process.platform === "win32") {
    win.setAppDetails({
      appId: WINDOWS_APP_USER_MODEL_ID,
      ...(appIconPath ? { appIconPath, appIconIndex: 0 } : {}),
      relaunchCommand: IS_PACKAGED_APP
        ? `"${process.execPath}"`
        : `"${process.execPath}" "${app.getAppPath()}"`,
      relaunchDisplayName: "CodeTeams",
    });
  }
  // Set Windows shell properties before the taskbar creates its visible button.
  win.once("ready-to-show", () => win.show());

  // Security: prevent arbitrary navigation or popup windows
  win.webContents.on("will-navigate", (event, targetUrl) => {
    const devUrl =
      typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== "undefined"
        ? MAIN_WINDOW_VITE_DEV_SERVER_URL
        : undefined;
    if (devUrl && targetUrl.startsWith(devUrl)) return;
    event.preventDefault();
  });

  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  // Graceful close check when runs or single-agent turns are active (Spec Section 6.3)
  win.on("close", async (event) => {
    if (isQuitting || !coreBridge) return;
    try {
      const [runs, convs] = await Promise.all([
        coreBridge.call("runs.list", { limit: 20 }, 3000) as Promise<
          Array<{ state: string }>
        >,
        coreBridge.call("conversations.list", { includeArchived: false }, 3000) as Promise<
          Array<{ activeTurn?: { state: string } | null }>
        >,
      ]);
      const activeRunCount = runs.filter(
        (r) =>
          r.state === "running" ||
          r.state === "queued" ||
          r.state === "waiting_permission"
      ).length;
      const activeChatCount = convs.filter((c) => Boolean(c.activeTurn)).length;
      const activeCount = activeRunCount + activeChatCount;

      if (activeCount > 0) {
        event.preventDefault();
        const choice = await dialog.showMessageBox(win, {
          type: "warning",
          buttons: ["保持运行", "安全停止并退出"],
          defaultId: 0,
          cancelId: 0,
          title: "任务正在运行",
          message: `当前有 ${activeCount} 个任务正在执行或等待授权。`,
          detail:
            "退出应用不会在后台继续执行任务。选择“安全停止并退出”将取消运行并保存检查点与历史记录。",
        });
        if (choice.response === 1) {
          isQuitting = true;
          await coreBridge.stop();
          win.destroy();
          app.quit();
        }
      }
    } catch {
      // Allow close if Core already exited
    }
  });

  const devServerUrl =
    typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== "undefined"
      ? MAIN_WINDOW_VITE_DEV_SERVER_URL
      : process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    await win.loadURL(devServerUrl);
  } else {
    const name =
      typeof MAIN_WINDOW_VITE_NAME !== "undefined"
        ? MAIN_WINDOW_VITE_NAME
        : "main_window";
    await win.loadFile(join(__dirname, `../renderer/${name}/index.html`));
  }

  win.on("closed", () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  return win;
}

function registerIpcHandlers(): void {
  const logos = loadOfficialAgentLogos(
    IS_PACKAGED_APP,
    process.resourcesPath,
    app.getAppPath()
  );

  ipcMain.handle(
    "codeteams:rpc",
    async (event, method: unknown, params: unknown) => {
      assertAuthorizedSender(event);
      if (typeof method !== "string" || !(method in RpcSchemas)) {
        throw new Error(`Disallowed or unknown RPC method: ${String(method)}`);
      }
      if (!coreBridge) {
        throw new Error("CodeTeams Core is not initialized");
      }
      return await coreBridge.call(method, params);
    }
  );

  ipcMain.handle("codeteams:selectProjectDirectory", async (event) => {
    assertAuthorizedSender(event);
    const result = await dialog.showOpenDialog(mainWindow ?? undefined!, {
      properties: ["openDirectory"],
      title: "选择本地项目目录",
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0] ?? null;
  });

  ipcMain.handle("codeteams:openExternalUrl", async (event, rawUrl: unknown) => {
    assertAuthorizedSender(event);
    if (typeof rawUrl !== "string") return false;
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return false;
      }
      await shell.openExternal(parsed.toString());
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle("codeteams:openDataDirectory", async (event) => {
    assertAuthorizedSender(event);
    await shell.openPath(getUserDataDir());
    return true;
  });

  ipcMain.handle(
    "codeteams:openPathInExplorer",
    async (event, rawPath: unknown) => {
      assertAuthorizedSender(event);
      if (typeof rawPath !== "string" || !rawPath.trim()) return false;
      if (!existsSync(rawPath)) return false;
      try {
        const st = statSync(rawPath);
        if (st.isDirectory()) {
          await shell.openPath(rawPath);
        } else {
          shell.showItemInFolder(rawPath);
        }
        return true;
      } catch {
        return false;
      }
    }
  );

  ipcMain.handle("codeteams:getAppMeta", async (event) => {
    assertAuthorizedSender(event);
    return {
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      userDataDir: getUserDataDir(),
      isPackaged: IS_PACKAGED_APP,
    };
  });

  ipcMain.handle("codeteams:getAgentLogos", async (event) => {
    assertAuthorizedSender(event);
    return logos;
  });
}

app.whenReady().then(async () => {
  registerWindowsAppUserModelId();
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
  }

  // Enforce Content Security Policy
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' http://localhost:* ws://localhost:*;",
        ],
      },
    });
  });

  coreBridge = new CoreProcessBridge({
    userDataDir: getUserDataDir(),
    isPackaged: IS_PACKAGED_APP,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
    onEvent: (ev: CoreEvent) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("codeteams:event", ev);
      }
      void notifyConversationEvent(ev);
    },
    onCoreExit: (code) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("codeteams:core-disconnected", { code });
      }
    },
  });

  await coreBridge.start();
  registerIpcHandlers();
  mainWindow = await createMainWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = await createMainWindow();
    }
  });
});

app.on("before-quit", async (event) => {
  for (const n of activeNotifications) {
    try {
      n.close();
    } catch {
      // Ignore
    }
  }
  activeNotifications.clear();
  if (!isQuitting && coreBridge) {
    event.preventDefault();
    isQuitting = true;
    await coreBridge.stop();
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
