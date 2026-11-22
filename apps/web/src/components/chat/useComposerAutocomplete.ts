import { useAtomValue } from "@effect/atom-react";
import {
  MAX_COMPOSER_AUTOCOMPLETE_DRAFT_LENGTH,
  type EnvironmentId,
  type ThreadId,
} from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useStableCallback } from "../../hooks/useStableCallback";
import { useServerConfigs } from "../../state/entities";
import { orchestrationEnvironment } from "../../state/orchestration";
import { useAtomCommand } from "../../state/use-atom-command";

const command = orchestrationEnvironment.v2.completeComposer;
const COMPLETION_DELAY_MS = 650;

export function useComposerAutocomplete(
  environmentId: EnvironmentId,
  threadId: ThreadId | null,
  draftKey: string,
  draft: string,
  active: boolean,
) {
  const config = useServerConfigs().get(environmentId);
  const permitted = useAtomValue(command.permissionAtom(environmentId));
  const hasFinePointer = useMediaQuery("(any-pointer: fine)");
  const eligible =
    active &&
    hasFinePointer &&
    permitted &&
    config?.composerAutocomplete === true &&
    config.settings.composerAutocompleteEnabled &&
    draft.length <= MAX_COMPOSER_AUTOCOMPLETE_DRAFT_LENGTH &&
    draft.trim().length >= 3 &&
    !draft.trimStart().startsWith("/");
  const run = useStableCallback(useAtomCommand(command, { reportFailure: false }));
  const requestKey = eligible
    ? JSON.stringify([
        environmentId,
        draftKey,
        threadId,
        draft,
        config.settings.composerAutocompleteModelSelection ??
          config.settings.textGenerationModelSelection,
        config.settings.composerAutocompleteContextTokens,
      ])
    : null;
  const [result, setResult] = useState<{ key: string; suffix: string } | null>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- starts the debounced environment request for the active draft
  useEffect(() => {
    if (requestKey === null) return;
    let current = true;
    const timer = window.setTimeout(() => {
      void run({ environmentId, input: { threadId, draft } }).then((answer) => {
        if (current && answer._tag === "Success") {
          setResult({ key: requestKey, suffix: answer.value.suffix });
        }
      });
    }, COMPLETION_DELAY_MS);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [draft, environmentId, requestKey, run, threadId]);

  return {
    suffix: requestKey !== null && result?.key === requestKey ? result.suffix : "",
    dismiss: () => setResult(null),
  };
}
