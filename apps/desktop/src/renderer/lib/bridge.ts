import type { CoreEvent, RpcMethod, RpcParams } from "@codeteams/shared";
import type { CodeTeamsBridgeApi } from "../../preload";

declare global {
  interface Window {
    codeteams: CodeTeamsBridgeApi;
  }
}

export function getBridge(): CodeTeamsBridgeApi {
  if (!window.codeteams) {
    throw new Error("CodeTeams preload bridge is unavailable.");
  }
  return window.codeteams;
}

export async function rpc<M extends RpcMethod, R = unknown>(
  method: M,
  params?: RpcParams<M>
): Promise<R> {
  return await getBridge().rpc<M, R>(method, params);
}

export function subscribeCoreEvents(
  listener: (event: CoreEvent) => void
): () => void {
  return getBridge().onEvent(listener);
}
