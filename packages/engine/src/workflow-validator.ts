import {
  CoreError,
  WorkflowDefinitionSchema,
  type WorkflowDefinition,
  type WorkflowEdge,
  type WorkflowStep,
} from "@codeteams/shared";

export interface WorkflowValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Resolves explicit DAG edges if provided; otherwise falls back to legacy linear chaining
 * steps[0] -> steps[1] -> ... for backwards compatibility with older saved workflows.
 */
export function resolveWorkflowEdges(
  definition: Pick<WorkflowDefinition, "steps" | "edges">
): WorkflowEdge[] {
  if (definition.edges !== undefined) {
    return definition.edges;
  }
  const implicit: WorkflowEdge[] = [];
  for (let i = 0; i < definition.steps.length - 1; i++) {
    const src = definition.steps[i]!;
    const dst = definition.steps[i + 1]!;
    implicit.push({
      id: `edge-${src.id}-${dst.id}`,
      source: src.id,
      target: dst.id,
    });
  }
  return implicit;
}

/**
 * Groups workflow steps into topological execution waves (layers).
 * Steps in the same wave have all their upstream dependencies satisfied and can execute in parallel
 * (e.g. 1->2, 1->3, 2->4, 3->4 produces waves: [ [1], [2, 3], [4] ]).
 * Returns null if the graph contains a cycle.
 */
export function computeWorkflowLayers(
  steps: WorkflowStep[],
  edges: WorkflowEdge[]
): WorkflowStep[][] | null {
  if (steps.length === 0) return [];
  const stepById = new Map(steps.map((s) => [s.id, s]));
  const inDegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const s of steps) {
    inDegree.set(s.id, 0);
    outgoing.set(s.id, []);
  }

  for (const e of edges) {
    if (!stepById.has(e.source) || !stepById.has(e.target)) continue;
    outgoing.get(e.source)!.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }

  const layers: WorkflowStep[][] = [];
  let ready = steps.filter((s) => (inDegree.get(s.id) ?? 0) === 0);
  let visited = 0;

  while (ready.length > 0) {
    layers.push(ready);
    visited += ready.length;
    const nextReady: WorkflowStep[] = [];
    for (const node of ready) {
      for (const nxtId of outgoing.get(node.id) ?? []) {
        const deg = (inDegree.get(nxtId) ?? 0) - 1;
        inDegree.set(nxtId, deg);
        if (deg === 0) {
          nextReady.push(stepById.get(nxtId)!);
        }
      }
    }
    // Preserve stable step order inside each wave
    const orderIdx = new Map(steps.map((s, idx) => [s.id, idx]));
    nextReady.sort(
      (a, b) => (orderIdx.get(a.id) ?? 0) - (orderIdx.get(b.id) ?? 0)
    );
    ready = nextReady;
  }

  if (visited !== steps.length) {
    return null; // Cycle detected
  }
  return layers;
}

/**
 * Validates that a workflow is an acyclic Coding-Agent-only DAG (including linear chains and
 * parallel branch/join topologies) with unique step IDs, valid registered agent IDs, and valid edges.
 */
export function validateWorkflowDefinition(
  definition: unknown,
  knownAgentIds: Set<string>,
  options: { requireNonEmpty?: boolean } = {}
): WorkflowValidationResult {
  const parsed = WorkflowDefinitionSchema.safeParse(definition);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map(
        (i) => `${i.path.join(".") || "workflow"}: ${i.message}`
      ),
    };
  }

  const wf = parsed.data;
  const errors: string[] = [];
  const seenStepIds = new Set<string>();

  if (options.requireNonEmpty && wf.steps.length === 0) {
    errors.push("Workflow must contain at least one Coding Agent step.");
  }

  for (let i = 0; i < wf.steps.length; i++) {
    const step = wf.steps[i]!;
    if (seenStepIds.has(step.id)) {
      errors.push(`Duplicate step ID "${step.id}" at position ${i + 1}.`);
    }
    seenStepIds.add(step.id);

    if (!knownAgentIds.has(step.agentId)) {
      errors.push(
        `Unknown Coding Agent "${step.agentId}" at step "${step.id}". Only registered Coding Agents are allowed.`
      );
    }
  }

  if (wf.edges !== undefined) {
    const seenPairs = new Set<string>();
    for (const edge of wf.edges) {
      if (!seenStepIds.has(edge.source)) {
        errors.push(`Edge "${edge.id}" references unknown source step "${edge.source}".`);
      }
      if (!seenStepIds.has(edge.target)) {
        errors.push(`Edge "${edge.id}" references unknown target step "${edge.target}".`);
      }
      if (edge.source === edge.target) {
        errors.push(`Edge "${edge.id}" cannot connect step "${edge.source}" to itself.`);
      }
      const pairKey = `${edge.source}->${edge.target}`;
      if (seenPairs.has(pairKey)) {
        errors.push(`Duplicate edge between "${edge.source}" and "${edge.target}".`);
      }
      seenPairs.add(pairKey);
    }

    if (errors.length === 0) {
      const layers = computeWorkflowLayers(wf.steps, wf.edges);
      if (!layers) {
        errors.push("Workflow graph contains a cycle; loops are not allowed.");
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function assertValidWorkflow(
  definition: unknown,
  knownAgentIds: Set<string>,
  options: { requireNonEmpty?: boolean } = {}
): WorkflowDefinition {
  const res = validateWorkflowDefinition(definition, knownAgentIds, options);
  if (!res.valid) {
    throw new CoreError("INVALID_WORKFLOW", res.errors.join("; "), {
      errors: res.errors,
    });
  }
  return WorkflowDefinitionSchema.parse(definition);
}
