import {
  EnvironmentId,
  type ProviderInstanceId,
  type ServerProvider,
  type ServerProviderUsageLimits,
  type ServerProviderUsageWindow,
  type UsageLimitsReport,
  type UsageLimitSourceSnapshots,
} from "@t3tools/contracts";
import {
  collectLimitAccounts,
  collectLimitPools,
  collectProviderUsageLimits,
  displayLimitWindows,
  hubRoutes,
  instanceHubs,
  remainingPercent,
  type LimitPoolWindow,
} from "@t3tools/shared/usageLimits";
import { limitsNotice } from "@t3tools/shared/usageLimitsCopy";

export type ThreadDetailsLimits =
  | { readonly kind: "instance"; readonly limits: ServerProviderUsageLimits }
  | { readonly kind: "pool"; readonly windows: readonly LimitPoolWindow[] }
  | {
      readonly kind: "account";
      readonly windows: readonly ServerProviderUsageWindow[];
      readonly isLimited: boolean;
    };

// collectLimitAccounts keys its input by environment; the card reads one, so any id serves.
const CARD_ENVIRONMENT = EnvironmentId.make("thread-details");

export function resolveThreadDetailsLimits(
  providerInstanceId: ProviderInstanceId | null,
  model: string | null,
  providers: readonly ServerProvider[],
  sources: UsageLimitSourceSnapshots,
  now: number,
): ThreadDetailsLimits | null {
  const provider = providers.find((entry) => entry.instanceId === providerInstanceId);
  if (!provider) return null;
  const report = collectProviderUsageLimits(provider.instanceId, providers, sources, now, model);
  // Only this instance's data: the report keeps one instance per login, and any other entry may be
  // a different login or workspace, so fall back to the instance's own snapshot.
  const own =
    report?.accounts.find((entry) => entry.instanceId === provider.instanceId)?.limits ??
    provider.usageLimits;
  const instance = own ? { kind: "instance" as const, limits: own } : null;
  if (own && limitsNotice(own) === null && own.windows.length > 0) return instance;

  const hubs = instanceHubs(provider, sources);
  const pooled = hubs.length > 0 ? hubPool(provider.driver, model, providers, hubs, now) : null;
  if (pooled) return pooled;

  // A direct instance can use another native reading, but only a known hub may supply hub quotas.
  const accounts = (report?.accounts ?? []).filter(
    (account) =>
      account.driver === provider.driver &&
      (hubs.length > 0 || account.instanceId != null) &&
      account.limits.windows.length > 0 &&
      limitsNotice(account.limits) === null,
  );
  return fallbackAccount(accounts) ?? instance;
}

function fallbackAccount(
  pooledAccounts: UsageLimitsReport["accounts"],
): ThreadDetailsLimits | null {
  const accountsWith5h = pooledAccounts
    .map((acc) => {
      const sessionWindow = acc.limits.windows.find(
        (w) => w.kind === "session" || (w.windowDurationMins ?? 0) <= 300,
      );
      if (!sessionWindow) return null;
      const weeklyWindow = acc.limits.windows.find(
        (w) =>
          w.kind === "weekly" ||
          ((w.windowDurationMins ?? 0) > 300 && (w.windowDurationMins ?? 0) <= 10080),
      );
      const sessionRemaining = remainingPercent(sessionWindow);
      const weeklyRemaining = weeklyWindow ? remainingPercent(weeklyWindow) : null;
      return {
        sessionWindow,
        weeklyWindow,
        sessionRemaining,
        weeklyRemaining,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const nonZero5h = accountsWith5h.filter((entry) => entry.sessionRemaining > 0);

  if (nonZero5h.length > 0) {
    nonZero5h.sort((a, b) => {
      if (a.sessionRemaining !== b.sessionRemaining) {
        return a.sessionRemaining - b.sessionRemaining;
      }
      if (a.weeklyRemaining !== null && b.weeklyRemaining !== null) {
        return a.weeklyRemaining - b.weeklyRemaining;
      }
      return 0;
    });
    const chosen = nonZero5h[0];
    if (chosen) {
      const windows = [chosen.sessionWindow, chosen.weeklyWindow].filter(
        (w): w is ServerProviderUsageWindow => Boolean(w),
      );
      return { kind: "account", windows, isLimited: false };
    }
  }

  const accountsWithMonthly = pooledAccounts
    .map((acc) => {
      const monthlyWindow = acc.limits.windows.find(
        (w) => w.kind === "monthly" || (w.windowDurationMins ?? 0) > 10080,
      );
      if (!monthlyWindow) return null;
      const monthlyRemaining = remainingPercent(monthlyWindow);
      const onlyMonthly = acc.limits.windows.every(
        (w) => w.kind === "monthly" || w.id === monthlyWindow.id,
      );
      return {
        monthlyWindow,
        monthlyRemaining,
        onlyMonthly,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  if (accountsWithMonthly.length > 0) {
    accountsWithMonthly.sort((a, b) => b.monthlyRemaining - a.monthlyRemaining);
    const chosen = accountsWithMonthly[0];
    if (chosen) {
      return {
        kind: "account",
        windows: [chosen.monthlyWindow],
        isLimited: chosen.onlyMonthly,
      };
    }
  }

  if (accountsWith5h.length > 0) {
    accountsWith5h.sort((a, b) => {
      const resetA = a.sessionWindow.resetsAt
        ? Date.parse(a.sessionWindow.resetsAt)
        : Number.POSITIVE_INFINITY;
      const resetB = b.sessionWindow.resetsAt
        ? Date.parse(b.sessionWindow.resetsAt)
        : Number.POSITIVE_INFINITY;
      return resetA - resetB;
    });
    const chosen = accountsWith5h[0];
    if (chosen) {
      const windows = [chosen.sessionWindow, chosen.weeklyWindow].filter(
        (w): w is ServerProviderUsageWindow => Boolean(w),
      );
      return { kind: "account", windows, isLimited: false };
    }
  }

  return null;
}

export function resolveThreadHttpQuotas(
  providerInstanceId: ProviderInstanceId | null,
  sources: UsageLimitSourceSnapshots,
) {
  if (providerInstanceId === null) return [];
  return sources.flatMap((source) =>
    source.kind === "http"
      ? (source.quotaAccounts ?? []).flatMap((account) =>
          account.providerInstanceId === providerInstanceId
            ? account.windows.map((window) => ({
                key: JSON.stringify([source.id, account.id, window.id]),
                accountLabel: account.label,
                window,
              }))
            : [],
        )
      : [],
  );
}

export function nextPoolReset(window: LimitPoolWindow, now: number) {
  const pooled = window.members.length > 1;
  return (
    window.resets.find((reset) => reset.at > now && (!pooled || reset.restoresPercent > 0)) ?? null
  );
}

function hubPool(
  driver: ServerProvider["driver"],
  model: string | null,
  providers: readonly ServerProvider[],
  sources: UsageLimitSourceSnapshots,
  now: number,
): ThreadDetailsLimits | null {
  const routes = hubRoutes(sources, driver, model);
  const routed = sources.map((source) => ({
    ...source,
    accounts: source.accounts.filter(routes),
  }));
  const readable = routed
    .flatMap((source) => source.accounts)
    .filter((account) => limitsNotice(account.usageLimits) === null);
  if (readable.length === 0) return null;
  // A signed-in login joins the pool only as a fresher reading of an account the hub routes to.
  const signedIn = providers.filter((provider) =>
    readable.some(
      (account) =>
        account.driver === provider.driver &&
        account.workspaceId === provider.auth.workspaceId &&
        account.email !== undefined &&
        account.email.toLowerCase() === provider.auth.email?.toLowerCase(),
    ),
  );
  const presentations = new Map([
    [
      CARD_ENVIRONMENT,
      {
        entry: { target: { label: "" } },
        serverConfig: { providers: signedIn, usageLimitSources: routed },
      },
    ],
  ]);
  const pools = collectLimitPools(collectLimitAccounts(presentations), now);
  return pools.length > 0 ? { kind: "pool", windows: pools.flatMap(displayLimitWindows) } : null;
}

export function poolSources(window: LimitPoolWindow) {
  const hubs = window.members.flatMap(({ account }) =>
    account.environments.length === 0 && account.sourceLabel ? [account.sourceLabel] : [],
  );
  const signedIn = window.members.some(({ account }) => account.environments.length > 0);
  return { hubs: [...new Set(hubs)], signedIn };
}
