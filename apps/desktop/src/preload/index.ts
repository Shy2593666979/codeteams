import { contextBridge, ipcRenderer } from "electron";
import type { CoreEvent, RpcMethod, RpcParams } from "@codeteams/shared";
import type { AgentLogoAssetEntry } from "../main/logos";

export interface CodeTeamsBridgeApi {
  rpc: <M extends RpcMethod, R = unknown>(
    method: M,
    params?: RpcParams<M>
  ) => Promise<R>;
  onEvent: (listener: (event: CoreEvent) => void) => () => void;
  onCoreDisconnected: (listener: (info: { code: number | null }) => void) => () => void;
  onNavigate: (listener: (path: string) => void) => () => void;
  selectProjectDirectory: () => Promise<string | null>;
  openExternalUrl: (url: string) => Promise<boolean>;
  openDataDirectory: () => Promise<boolean>;
  openPathInExplorer: (targetPath: string) => Promise<boolean>;
  getAppMeta: () => Promise<{
    version: string;
    platform: string;
    arch: string;
    userDataDir: string;
    isPackaged: boolean;
  }>;
  getAgentLogos: () => Promise<Record<string, AgentLogoAssetEntry>>;
}

const api: CodeTeamsBridgeApi = {
  rpc: (method, params) => ipcRenderer.invoke("codeteams:rpc", method, params),
  onEvent: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: CoreEvent) => {
      listener(payload);
    };
    ipcRenderer.on("codeteams:event", wrapped);
    return () => ipcRenderer.removeListener("codeteams:event", wrapped);
  },
  onCoreDisconnected: (listener) => {
    const wrapped = (
      _event: Electron.IpcRendererEvent,
      info: { code: number | null }
    ) => {
      listener(info);
    };
    ipcRenderer.on("codeteams:core-disconnected", wrapped);
    return () =>
      ipcRenderer.removeListener("codeteams:core-disconnected", wrapped);
  },
  onNavigate: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, path: string) => {
      listener(path);
    };
    ipcRenderer.on("codeteams:navigate", wrapped);
    return () => ipcRenderer.removeListener("codeteams:navigate", wrapped);
  },
  selectProjectDirectory: () =>
    ipcRenderer.invoke("codeteams:selectProjectDirectory"),
  openExternalUrl: (url) => ipcRenderer.invoke("codeteams:openExternalUrl", url),
  openDataDirectory: () => ipcRenderer.invoke("codeteams:openDataDirectory"),
  openPathInExplorer: (targetPath) =>
    ipcRenderer.invoke("codeteams:openPathInExplorer", targetPath),
  getAppMeta: () => ipcRenderer.invoke("codeteams:getAppMeta"),
  getAgentLogos: () => ipcRenderer.invoke("codeteams:getAgentLogos"),
};

contextBridge.exposeInMainWorld("codeteams", api);
