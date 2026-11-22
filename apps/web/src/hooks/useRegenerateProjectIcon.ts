import { scopeProjectKey, type ScopedProjectRef } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { projectEnvironment, regeneratingProjectIconKeysAtom } from "../state/projects";
import { useOrchestrationCommand } from "../state/use-orchestration-command";
import { stackedThreadToast, toastManager } from "../components/ui/toast";

export function useRegenerateProjectIcon() {
  const updateProject = useOrchestrationCommand(projectEnvironment.update, {
    reportFailure: false,
  });
  return async (ref: ScopedProjectRef) => {
    const key = scopeProjectKey(ref);
    const prev = appAtomRegistry.get(regeneratingProjectIconKeysAtom);
    if (prev.has(key)) return;

    const unmount = appAtomRegistry.mount(regeneratingProjectIconKeysAtom);
    const next = new Set(prev);
    next.add(key);
    appAtomRegistry.set(regeneratingProjectIconKeysAtom, next);
    const progressToast = toastManager.add(
      stackedThreadToast({ type: "loading", title: "Regenerating project icon…", timeout: 0 }),
    );

    const result = await updateProject({
      environmentId: ref.environmentId,
      input: { projectId: ref.projectId, regenerateIcon: true },
    }).finally(() => {
      const cleaned = new Set(appAtomRegistry.get(regeneratingProjectIconKeysAtom));
      cleaned.delete(key);
      appAtomRegistry.set(regeneratingProjectIconKeysAtom, cleaned);
      unmount();
      toastManager.close(progressToast);
    });
    if (result._tag === "Failure") {
      if (isAtomCommandInterrupted(result)) return result;
      const error = squashAtomCommandFailure(result);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to regenerate project icon",
          description: error instanceof Error ? error.message : "Could not generate project icon.",
        }),
      );
    } else {
      toastManager.add(
        stackedThreadToast({
          type: "info",
          title: "Project icon updated",
          description: "The icon was successfully regenerated.",
        }),
      );
    }
    return result;
  };
}
