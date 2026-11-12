import type { ScopedProjectRef } from "@t3tools/contracts";
import { projectEnvironment } from "../state/projects";
import { useOrchestrationCommand } from "../state/use-orchestration-command";

export function useRegenerateProjectIcon() {
  const updateProject = useOrchestrationCommand(projectEnvironment.update);
  return (ref: ScopedProjectRef) =>
    updateProject({
      environmentId: ref.environmentId,
      input: { projectId: ref.projectId, regenerateIcon: true },
    });
}
