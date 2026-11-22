import { RegistryContext } from "@effect/atom-react";
import { CommandId, EnvironmentId, ProjectId, ProjectMutationError } from "@t3tools/contracts";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import * as Cause from "effect/Cause";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";

import { render } from "../../test/render";
import { useRegenerateProjectIcon } from "../hooks/useRegenerateProjectIcon";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { ProjectFavicon, type ProjectFaviconProject } from "./ProjectFavicon";
import { toastManager } from "./ui/toast";

const state = vi.hoisted(() => ({
  favicon: undefined as Atom.Atom<string | null> | undefined,
  updateProject: vi.fn<() => Promise<AtomCommandResult<void, ProjectMutationError>>>(),
}));
vi.mock("../state/use-orchestration-command", () => ({
  useOrchestrationCommand: () => state.updateProject,
}));
vi.mock(import("../state/assets"), () => ({
  projectFaviconUrlAtom: () => {
    if (!state.favicon) throw new Error("Favicon resource not configured");
    return state.favicon;
  },
}));

function setup() {
  state.updateProject.mockReset();
  const activeResources = new Set<string>();
  state.favicon = Atom.make((get) => {
    activeResources.add("favicon");
    get.addFinalizer(() => activeResources.delete("favicon"));
    return null;
  });
  return { activeResources };
}

it("only activates the favicon resource after removing a custom icon", async () => {
  const { activeResources } = setup();
  const registry = AtomRegistry.make();
  const project: ProjectFaviconProject = {
    environmentId: EnvironmentId.make("test"),
    workspaceRoot: "/project",
    title: "Project",
    faviconPath: "icon.png",
    projectIcon: { kind: "monogram", text: "PR", color: "blue" },
  };
  const view = (projectIcon: ProjectFaviconProject["projectIcon"]) => (
    <RegistryContext value={registry}>
      <ProjectFavicon project={{ ...project, projectIcon }} />
    </RegistryContext>
  );
  try {
    await using screen = await render(view(project.projectIcon));
    expect(activeResources.size).toBe(0);
    await screen.rerender(view({ kind: "emoji", emoji: "🌱" }));
    expect(activeResources.size).toBe(0);
    await screen.rerender(view({ kind: "lucide", name: "leaf", color: "green" }));
    expect(activeResources.size).toBe(0);
    await screen.rerender(view(null));
    expect(activeResources.size).toBe(1);
    await screen.rerender(view(project.projectIcon));
    await screen.rerender(view(null));
    expect(activeResources.size).toBe(1);
  } finally {
    registry.dispose();
  }
});

function RegenerateIconTestButton(props: { project: ProjectFaviconProject & { id: ProjectId } }) {
  const regenerateProjectIcon = useRegenerateProjectIcon();
  const { project } = props;
  return (
    <button
      type="button"
      onClick={() =>
        void regenerateProjectIcon({ environmentId: project.environmentId, projectId: project.id })
      }
    >
      Regenerate project icon
    </button>
  );
}

it("keeps displaying the current icon and reports the reason regeneration failed", async () => {
  setup();
  let resolveUpdate!: (result: AtomCommandResult<void, ProjectMutationError>) => void;
  const updatePromise = new Promise<AtomCommandResult<void, ProjectMutationError>>((resolve) => {
    resolveUpdate = resolve;
  });
  state.updateProject.mockReturnValue(updatePromise);
  const project: ProjectFaviconProject & { id: ProjectId } = {
    id: ProjectId.make("project"),
    environmentId: EnvironmentId.make("test"),
    workspaceRoot: "/project",
    title: "Project",
    faviconPath: null,
    projectIcon: { kind: "monogram", text: "PR", color: "blue" },
  };
  const error = new ProjectMutationError({
    commandId: CommandId.make("regenerate-icon"),
    message: "No model available.",
  });
  await using screen = await render(
    <RegistryContext value={appAtomRegistry}>
      <ProjectFavicon project={project} />
      <RegenerateIconTestButton project={project} />
    </RegistryContext>,
  );
  using addToast = vi.spyOn(toastManager, "add").mockReturnValue("regeneration-toast");
  using closeToast = vi.spyOn(toastManager, "close").mockImplementation(() => {});
  const icon = screen.container.querySelector('[data-slot="project-monogram"]');
  expect(icon).not.toBeNull();

  try {
    await screen.getByRole("button", { name: "Regenerate project icon" }).click();
    expect(screen.container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.container.querySelector('[data-slot="project-monogram"]')).toBe(icon);
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: "loading" }));
  } finally {
    resolveUpdate(AsyncResult.failure(Cause.fail(error)));
  }
  await vi.waitFor(() => expect(screen.container.querySelector('[aria-busy="true"]')).toBeNull());
  expect(screen.container.querySelector('[data-slot="project-monogram"]')).toBe(icon);
  expect(closeToast).toHaveBeenCalledWith("regeneration-toast");
  expect(addToast).toHaveBeenCalledWith(
    expect.objectContaining({ type: "error", description: "No model available." }),
  );
});
