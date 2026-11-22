import { useAuth } from "@clerk/react";
import { Link } from "@tanstack/react-router";
import {
  DEFAULT_SERVER_SETTINGS,
  MAX_COMPOSER_AUTOCOMPLETE_CONTEXT_TOKENS,
  managedCapabilityDenial,
} from "@t3tools/contracts";

import { hasCloudPublicConfig } from "~/cloud/publicConfig";
import { useT3ConnectAuthPrompt } from "../clerk/useT3ConnectAuthPrompt";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { useEnvironmentProviders } from "../../state/environments";
import { EMPTY_SERVER_PROVIDERS } from "../../state/server";
import { useTextGenerationTargets } from "../../textGenerators";
import { getTextGenerationModelOptionsByInstance } from "../../modelSelection";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { pickModelSelection } from "@t3tools/shared/model";
import { ScopedSwitch } from "./ScopedSwitch";
import {
  SETTINGS_PICKER_TRIGGER_CLASSNAME,
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { useScopedModelDisabledReason } from "./useScopedModelAvailability";
import {
  useScopedSettings,
  useScopedSettingsMixed,
  useUpdateScopedSettings,
} from "./useScopedSettings";
import { useOptionalSettingsScope, useSettingsScope } from "./SettingsScopeContext";
import { firstManagedDenial, usePrimaryManagedPolicy } from "~/state/managedPolicy";

/** Features still settling in. */
export function LabsSettingsPanel() {
  return (
    <SettingsPageContainer>
      <SettingsSection id="beta" title="Beta">
        <BoringSidebarRow />
        {/* Clerk is only mounted when this build has T3 Connect. */}
        {hasCloudPublicConfig() ? <GuestLinksRowWithSignIn /> : <GuestLinksRow />}
        <LinkedEnvironmentsRow />
        <PromptSuggestionsRow />
        <ComposerAutocompleteSettings />
        <SimlockHostsRow />
        <FastWorktreeCheckoutRow />
      </SettingsSection>
    </SettingsPageContainer>
  );
}

function BoringSidebarRow() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  return (
    <SettingsRow
      {...searchableSetting("boring-sidebar")}
      description="Group sidebar threads into project folders. Pinned threads stay on top, and Snoozed and Settled stay below the folders."
      control={
        <Switch
          checked={settings.boringSidebarEnabled}
          onCheckedChange={(checked) => updateSettings({ boringSidebarEnabled: Boolean(checked) })}
          aria-label="Boring sidebar (group by project)"
        />
      }
    >
      {settings.boringSidebarEnabled ? (
        <div className="mt-2 mb-2 border-l-2 border-border/60 ps-3">
          <BoringSidebarMultilineRow />
        </div>
      ) : null}
    </SettingsRow>
  );
}

function BoringSidebarMultilineRow() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  return (
    <SettingsRow
      {...searchableSetting("boring-sidebar-multiline")}
      className="px-0 py-2 sm:px-0"
      description="Show folder threads on two lines: the title, then the branch, pull request, and agent."
      control={
        <Switch
          checked={settings.boringSidebarMultilineRows}
          onCheckedChange={(checked) =>
            updateSettings({ boringSidebarMultilineRows: Boolean(checked) })
          }
          aria-label="Two-line folder rows"
        />
      }
    />
  );
}

/** Signed out of T3 Connect, the row offers to sign in instead of its switch. */
function GuestLinksRowWithSignIn() {
  const { isSignedIn } = useAuth();
  const { openAuthPrompt } = useT3ConnectAuthPrompt();
  // `isSignedIn` is undefined until Clerk loads.
  if (isSignedIn !== false) return <GuestLinksRow />;
  return (
    <SettingsRow
      {...searchableSetting("guest-links")}
      description="Share a thread with a guest who watches it live in a browser and sends messages you approve. Sign in to T3 Connect to use guest links."
      control={
        <Button size="sm" variant="outline" onClick={openAuthPrompt}>
          Sign in
        </Button>
      }
    />
  );
}

function GuestLinksRow() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const scope = useOptionalSettingsScope();
  const primaryPolicy = usePrimaryManagedPolicy();
  // Guests arrive through T3 Connect, so a policy that turns Connect off turns this off too.
  const connectDenial = firstManagedDenial(
    scope
      ? scope.connectedEnvironments.map((environment) => environment.serverConfig?.managedPolicy)
      : [primaryPolicy],
    (policy) => managedCapabilityDenial(policy, "connect"),
  );
  return (
    <SettingsRow
      serverScoped
      {...searchableSetting("guest-links")}
      settingKeys={["guestSharingEnabled"]}
      // Turning guest links off still works without T3 Connect.
      managed={settings.guestSharingEnabled ? undefined : connectDenial}
      description={
        <>
          Share a thread with a guest who watches it live in a browser and sends messages you
          approve. Needs T3 Connect: sign in and link this machine in{" "}
          <Link to="/settings/access" className="underline underline-offset-2">
            Sharing & access
          </Link>
          . Turning it off stops every guest link.
        </>
      }
      control={
        <ScopedSwitch
          settingKeys={["guestSharingEnabled"]}
          checked={settings.guestSharingEnabled}
          onCheckedChange={(checked) => updateSettings({ guestSharingEnabled: Boolean(checked) })}
          aria-label="Guest links"
        />
      }
    />
  );
}

function LinkedEnvironmentsRow() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  return (
    <SettingsRow
      serverScoped
      {...searchableSetting("linked-environments-beta")}
      settingKeys={["linkedEnvironmentsEnabled"]}
      description={
        <>
          Let agents here work on your other machines, and theirs here. Turn it on for each machine,
          then link them in{" "}
          <Link to="/settings/connections" className="underline underline-offset-2">
            Connections
          </Link>
          . While off, nothing new starts over a link; running tasks finish.
        </>
      }
      control={
        <ScopedSwitch
          settingKeys={["linkedEnvironmentsEnabled"]}
          checked={settings.linkedEnvironmentsEnabled}
          onCheckedChange={(checked) =>
            updateSettings({ linkedEnvironmentsEnabled: Boolean(checked) })
          }
          aria-label="Linked environments"
        />
      }
    />
  );
}

function PromptSuggestionsRow() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  return (
    <SettingsRow
      serverScoped
      {...searchableSetting("prompt-suggestions-beta")}
      settingKeys={["promptSuggestionsEnabled"]}
      description="Show a predicted next message in the empty composer after a Claude or Codex turn. Tab uses it. Each is an extra cached request on your plan. Needs Codex 0.165+. Claude threads update on restart."
      control={
        <ScopedSwitch
          settingKeys={["promptSuggestionsEnabled"]}
          checked={settings.promptSuggestionsEnabled}
          onCheckedChange={(checked) =>
            updateSettings({ promptSuggestionsEnabled: Boolean(checked) })
          }
          aria-label="Suggest next prompt"
        />
      }
    />
  );
}

function ComposerAutocompleteSettings() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const { environment, connectedEnvironments } = useSettingsScope();
  const supported = connectedEnvironments.every(
    (candidate) => candidate.serverConfig?.composerAutocomplete === true,
  );
  return (
    <SettingsRow
      serverScoped
      {...searchableSetting("composer-autocomplete")}
      settingKeys={["composerAutocompleteEnabled"]}
      description={
        supported
          ? "Send your draft to the selected model after a pause in typing. Press Tab to insert the suggestion or Escape to dismiss it."
          : "Update the selected environments to use autocomplete."
      }
      control={
        <ScopedSwitch
          settingKeys={["composerAutocompleteEnabled"]}
          checked={settings.composerAutocompleteEnabled}
          disabled={!supported}
          onCheckedChange={(checked) =>
            updateSettings({ composerAutocompleteEnabled: Boolean(checked) })
          }
          aria-label="Autocomplete messages"
        />
      }
    >
      {supported && settings.composerAutocompleteEnabled ? (
        <div className="mt-2 mb-2 border-l-2 border-border/60 ps-3">
          <AutocompleteModelRow />
          <AutocompleteContextRow key={environment?.environmentId} />
        </div>
      ) : null}
    </SettingsRow>
  );
}

function AutocompleteModelRow() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const { environment } = useSettingsScope();
  const providersByEnvironment = useEnvironmentProviders();
  const providers = environment
    ? (providersByEnvironment.get(environment.environmentId) ?? EMPTY_SERVER_PROVIDERS)
    : EMPTY_SERVER_PROVIDERS;
  const saved = settings.composerAutocompleteModelSelection;
  const targets = useTextGenerationTargets({
    environmentId: environment?.environmentId ?? null,
    settings,
    providers: providers.filter((provider) => provider.supportsTextGeneration !== false),
    projectId: null,
    selections: [saved, settings.textGenerationModelSelection],
  });
  const selection = saved ?? settings.textGenerationModelSelection;
  const modelOptionsByInstance = getTextGenerationModelOptionsByInstance(
    settings,
    targets.providers,
    selection.instanceId,
    selection.model,
  );
  const modelDisabledReason = useScopedModelDisabledReason(settings, targets.entries, true);
  const mixed = useScopedSettingsMixed(["composerAutocompleteModelSelection"]);
  return (
    <SettingsRow
      serverScoped
      settingKeys={["composerAutocompleteModelSelection"]}
      title="Autocomplete model"
      description={
        saved
          ? "Choose a model for draft suggestions."
          : "Using the environment’s text generation model."
      }
      className="px-0 py-2 sm:px-0"
      resetAction={
        saved || mixed ? (
          <SettingResetButton
            label="autocomplete model"
            tooltip="Use the default text generation model"
            onClick={() => updateSettings({ composerAutocompleteModelSelection: null })}
          />
        ) : null
      }
      control={
        <ProviderModelPicker
          environmentId={environment?.environmentId ?? null}
          activeInstanceId={selection.instanceId}
          model={selection.model}
          lockedProvider={null}
          instanceEntries={targets.entries}
          modelOptionsByInstance={modelOptionsByInstance}
          triggerClassName={SETTINGS_PICKER_TRIGGER_CLASSNAME}
          getModelDisabledReason={modelDisabledReason}
          onInstanceModelChange={(instanceId, model) =>
            updateSettings({
              composerAutocompleteModelSelection: pickModelSelection(selection, instanceId, model),
            })
          }
        />
      }
    />
  );
}

function AutocompleteContextRow() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const mixed = useScopedSettingsMixed(["composerAutocompleteContextTokens"]);
  const tokens = settings.composerAutocompleteContextTokens;
  const defaultTokens = DEFAULT_SERVER_SETTINGS.composerAutocompleteContextTokens;
  return (
    <SettingsRow
      serverScoped
      settingKeys={["composerAutocompleteContextTokens"]}
      title="Autocomplete context"
      description="Estimated tokens of recent conversation sent with each draft. Set to 0 to send only the draft."
      className="px-0 py-2 sm:px-0"
      resetAction={
        mixed || tokens !== defaultTokens ? (
          <SettingResetButton
            label="autocomplete context"
            onClick={() => updateSettings({ composerAutocompleteContextTokens: defaultTokens })}
          />
        ) : null
      }
      control={
        <div className="w-24">
          <Input
            key={mixed ? "mixed" : tokens}
            size="sm"
            type="number"
            min={0}
            max={MAX_COMPOSER_AUTOCOMPLETE_CONTEXT_TOKENS}
            defaultValue={mixed ? "" : tokens}
            placeholder={mixed ? "Mixed" : undefined}
            onBlur={({ currentTarget }) => {
              const next = currentTarget.valueAsNumber;
              if (!currentTarget.validity.valid || !Number.isInteger(next)) {
                currentTarget.value = mixed ? "" : String(tokens);
              } else if (mixed || next !== tokens) {
                updateSettings(
                  { composerAutocompleteContextTokens: next },
                  {
                    onFailed: () => {
                      currentTarget.value = mixed ? "" : String(tokens);
                    },
                  },
                );
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing)
                event.currentTarget.blur();
            }}
            aria-label="Autocomplete context tokens"
          />
        </div>
      }
    />
  );
}

function SimlockHostsRow() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  return (
    <SettingsRow
      serverScoped
      {...searchableSetting("simlock-hosts")}
      settingKeys={["simlockDeviceHostsEnabled"]}
      description={
        <>
          Let the Device panel lease simulators and emulators from your own{" "}
          <a
            href="https://incubator.callstack.com/simlock/"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            Simlock
          </a>{" "}
          pool, added in{" "}
          <Link to="/settings/devices" className="underline underline-offset-2">
            Devices
          </Link>
          . An alpha that may change or break. T3 Code never installs Simlock.
        </>
      }
      control={
        <ScopedSwitch
          settingKeys={["simlockDeviceHostsEnabled"]}
          checked={settings.simlockDeviceHostsEnabled}
          onCheckedChange={(checked) =>
            updateSettings({ simlockDeviceHostsEnabled: Boolean(checked) })
          }
          aria-label="Simlock device hosts"
        />
      }
    />
  );
}

/** Shows only when every machine in scope is a Mac, since only macOS servers honor it. */
function FastWorktreeCheckoutRow() {
  const { scope, connectedEnvironments } = useSettingsScope();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  if (
    scope.kind === "project" ||
    scope.kind === "checkout" ||
    connectedEnvironments.length === 0 ||
    connectedEnvironments.some(
      (environment) =>
        environment.serverConfig?.environment.capabilities.fastWorktreeCheckout !== true,
    )
  )
    return null;
  return (
    <SettingsRow
      serverScoped
      {...searchableSetting("worktree-fast-checkout")}
      settingKeys={["fastWorktreeCheckout"]}
      description="On a Mac, clone new worktrees from a checkout cached in the T3 home folder instead of writing every file. Uses Git’s normal checkout when it can’t. Turning it off deletes the cache."
      control={
        <ScopedSwitch
          settingKeys={["fastWorktreeCheckout"]}
          checked={settings.fastWorktreeCheckout}
          onCheckedChange={(checked) => updateSettings({ fastWorktreeCheckout: Boolean(checked) })}
          aria-label="Fast worktree checkout"
        />
      }
    />
  );
}
