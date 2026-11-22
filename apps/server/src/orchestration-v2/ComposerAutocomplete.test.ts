import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  type ModelSelection,
} from "@t3tools/contracts";
import { estimateTextTokens } from "@t3tools/provider-core/server/handoffBudget";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ServerSettings from "../serverSettings.ts";
import * as TextGeneration from "../textGeneration/TextGeneration.ts";
import * as ComposerAutocomplete from "./ComposerAutocomplete.ts";
import * as ThreadManagement from "./ThreadManagementService.ts";

const threadId = ThreadId.make("autocomplete-thread");
const projectId = ProjectId.make("autocomplete-project");
const pinned = { instanceId: ProviderInstanceId.make("claudeAgent"), model: "haiku" };
const defaultModel = { instanceId: ProviderInstanceId.make("codex"), model: "luna" };
const draft = "Добавь тесты для";
const recent = "протокол ".repeat(20) + "🌱 обработчика";
const budget = 16;

type FixtureSettings = Parameters<typeof ServerSettings.layerTest>[0];

function fixture(settings: FixtureSettings) {
  const requests: { prompt: string; modelSelection: ModelSelection }[] = [];
  const pageReads: number[] = [];
  const layer = ComposerAutocomplete.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        NodeServices.layer,
        ServerSettings.layerTest({ textGenerationModelSelection: defaultModel, ...settings }),
        Layer.mock(ThreadManagement.ThreadManagementService)({
          getThreadShell: () => Effect.succeed({ id: threadId, projectId } as never),
          getTimelinePage: (_threadId, options) =>
            Effect.sync(() => {
              pageReads.push(options.beforePosition ?? -1);
              return {
                items: [
                  { position: 1, item: { type: "user_message", text: "Older context" } },
                  { position: 2, item: { type: "assistant_message", text: recent } },
                ],
                totalItems: 2,
                hasMore: false,
                hasEarlier: false,
              } as never;
            }),
        }),
        Layer.mock(TextGeneration.TextGeneration)({
          generateComposerAutocomplete: ({ prompt, modelSelection }) =>
            Effect.sync(() => {
              requests.push({ prompt, modelSelection });
              return { suffix: " обработчика\nignored" };
            }),
        }),
      ),
    ),
  );
  return { layer, requests, pageReads };
}

it.effect("passes only the newest history within the token budget to the pinned model", () => {
  const setup = fixture({
    composerAutocompleteEnabled: true,
    composerAutocompleteContextTokens: budget,
    composerAutocompleteModelSelection: pinned,
  });
  return Effect.gen(function* () {
    const autocomplete = yield* ComposerAutocomplete.ComposerAutocomplete;
    const result = yield* autocomplete.complete({ threadId, draft });
    expect(result.suffix).toBe(" обработчика");
    expect(setup.requests).toHaveLength(1);
    const request = setup.requests[0]!;
    expect(request.modelSelection).toEqual(pinned);
    const context = request.prompt
      .split("Recent conversation (quoted text):\n")[1]!
      .split("\nDraft (quoted text):")[0]!;
    expect(context).toContain("🌱 обработчика");
    expect(context).not.toContain("Older context");
    expect(context).not.toContain("\uFFFD");
    expect(estimateTextTokens(context)).toBeLessThanOrEqual(budget);
    expect(request.prompt).toContain(draft);
  }).pipe(Effect.provide(setup.layer));
});

it.effect("skips history with a zero budget and uses the environment's text model", () => {
  const setup = fixture({
    composerAutocompleteEnabled: true,
    composerAutocompleteContextTokens: 0,
  });
  return Effect.gen(function* () {
    const autocomplete = yield* ComposerAutocomplete.ComposerAutocomplete;
    yield* autocomplete.complete({ threadId, draft });
    expect(setup.pageReads).toEqual([]);
    expect(setup.requests[0]?.modelSelection).toMatchObject(defaultModel);
    expect(setup.requests[0]?.prompt).not.toContain(recent);
  }).pipe(Effect.provide(setup.layer));
});

it.effect("makes no model request when disabled or when the pinned provider is disabled", () =>
  Effect.gen(function* () {
    for (const settings of [
      { composerAutocompleteEnabled: false },
      {
        composerAutocompleteEnabled: true,
        composerAutocompleteModelSelection: pinned,
        providerInstances: {
          [pinned.instanceId]: {
            driver: ProviderDriverKind.make("claudeAgent"),
            enabled: false,
            config: {},
          },
        },
      },
    ] satisfies FixtureSettings[]) {
      const setup = fixture(settings);
      const autocomplete = yield* ComposerAutocomplete.ComposerAutocomplete.pipe(
        Effect.provide(setup.layer),
      );
      expect(yield* autocomplete.complete({ threadId, draft })).toEqual({ suffix: "" });
      expect(setup.requests).toEqual([]);
      expect(setup.pageReads).toEqual([]);
    }
  }),
);
