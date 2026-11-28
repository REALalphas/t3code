import { useState } from "react";
import { flushSync } from "react-dom";
import { useGT } from "gt-react";

import { useClientSettings } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import { SharedTooltipTrigger } from "../ui/shared-tooltip";

const REDACTED_TEXT_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function redactedPlaceholder(value: string): string {
  let state = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    state ^= value.charCodeAt(index);
    state = Math.imul(state, 0x01000193);
  }

  const nextChar = () => {
    state = Math.imul(state ^ (state >>> 13), 0x85ebca6b);
    state = Math.imul(state ^ (state >>> 16), 0xc2b2ae35);
    return REDACTED_TEXT_ALPHABET[Math.abs(state) % REDACTED_TEXT_ALPHABET.length] ?? "x";
  };

  return Array.from(value, (char) => {
    if (char === "@" || char === "." || char === "-" || char === "_") return char;
    return nextChar();
  }).join("");
}

export function RedactedSensitiveText(props: {
  readonly value: string | null | undefined;
  readonly ariaLabel: string;
  readonly revealTooltip: string;
  readonly hideTooltip: string;
  readonly redact?: boolean;
  readonly className?: string | undefined;
}) {
  const [visibility, setVisibility] = useState<"hidden" | "hiding" | "revealed">("hidden");
  const revealed = visibility === "revealed";
  const value = props.value?.trim();
  const redacted = value ? redactedPlaceholder(value) : "";

  if (!value) return null;

  if (props.redact === false) {
    return (
      <span className={cn("inline-block min-w-0 text-muted-foreground", props.className)}>
        {value}
      </span>
    );
  }

  return (
    <SharedTooltipTrigger
      render={
        <button
          type="button"
          className={cn(
            "min-w-0 cursor-pointer rounded-sm font-mono text-2xs leading-normal transition hover:text-foreground",
            revealed ? "text-muted-foreground" : "select-none text-muted-foreground blur-xs",
            props.className,
          )}
          onClick={(event) => {
            if (!revealed) return setVisibility("revealed");
            const button = event.currentTarget;
            flushSync(() => setVisibility("hiding"));
            const finishHiding = () =>
              setVisibility((current) => (current === "hiding" ? "hidden" : current));
            const blur = button
              .getAnimations()
              .find(
                (animation) =>
                  animation instanceof CSSTransition && animation.transitionProperty === "filter",
              );
            // Theme changes suppress the transition; a reversed one settles once revealed.
            if (blur) void blur.finished.then(finishHiding, finishHiding);
            else finishHiding();
          }}
          aria-label={props.ariaLabel}
        >
          {visibility === "hidden" ? redacted : value}
        </button>
      }
      label={revealed ? props.hideTooltip : props.revealTooltip}
    />
  );
}

export function AccountEmailText(props: {
  readonly value: string | null | undefined;
  readonly className?: string;
}) {
  const gt = useGT();
  const hideAccountEmails = useClientSettings((settings) => settings.hideAccountEmails);
  const value = props.value?.trim();
  if (!value) return null;

  return hideAccountEmails ? (
    <RedactedSensitiveText
      key={`${value}:${hideAccountEmails}`}
      value={value}
      ariaLabel={gt("Toggle account email visibility")}
      revealTooltip={gt("Click to reveal email")}
      hideTooltip={gt("Click to hide email")}
      className={props.className}
    />
  ) : (
    <span
      className={cn(
        "inline-block min-w-0 font-mono text-2xs leading-normal text-muted-foreground",
        props.className,
      )}
    >
      {value}
    </span>
  );
}
