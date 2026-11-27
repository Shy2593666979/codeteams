import { z } from "zod";

export const CoreErrorCodeSchema = z.enum([
  "AGENT_NOT_INSTALLED",
  "AUTH_REQUIRED",
  "AUTOMATION_RESTRICTED",
  "SESSION_UNAVAILABLE",
  "WORKSPACE_BUSY",
  "INVALID_WORKFLOW",
  "INTERRUPTED",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "PERMISSION_DENIED",
  "PATH_ESCAPE",
  "ACP_PROTOCOL_ERROR",
  "TIMEOUT",
  "CANCELLED",
  "INTERNAL_ERROR",
]);

export type CoreErrorCode = z.infer<typeof CoreErrorCodeSchema>;

export const CoreErrorPayloadSchema = z.object({
  code: CoreErrorCodeSchema,
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type CoreErrorPayload = z.infer<typeof CoreErrorPayloadSchema>;

export class CoreError extends Error {
  readonly code: CoreErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: CoreErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "CoreError";
    this.code = code;
    this.details = details;
  }

  toPayload(): CoreErrorPayload {
    return {
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}
