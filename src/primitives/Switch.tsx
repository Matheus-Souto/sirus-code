import { useEffect, useRef, useState } from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { useArcReducedMotion } from "@/components/arc/lib/use-arc-motion";
import "@/styles/orbit-switch.css";

interface Props {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label?: string;
}

/** Glass track with a pearl knob that shows ✓ or ✕ (2026-10-12, styles E + F); no globe. */
export function Switch({ checked, onChange, disabled, label }: Props) {
  const reduced = useArcReducedMotion();
  const ref = useRef<HTMLButtonElement>(null);
  const [labelledBy, setLabelledBy] = useState<string>();
  useEffect(() => { setLabelledBy(ref.current?.closest<HTMLElement>("[data-setting-label]")?.dataset.settingLabel); }, []);
  return <SwitchPrimitive.Root ref={ref} className="orbit-switch" checked={checked} onCheckedChange={onChange} disabled={disabled}
    data-reduced={reduced || undefined} aria-label={label} aria-labelledby={label ? undefined : labelledBy}>
    <span className="orbit-switch-track" aria-hidden="true">
      <span className="orbit-switch-fill" />
      <SwitchPrimitive.Thumb className="orbit-switch-position">
        <span className="orbit-switch-pearl">
          <svg className="orbit-switch-mark orbit-switch-on" viewBox="0 0 12 12"><path d="M3 6.3 5.1 8.3 9 4" /></svg>
          <svg className="orbit-switch-mark orbit-switch-off" viewBox="0 0 12 12"><path d="M4 4 8 8M8 4 4 8" /></svg>
        </span>
      </SwitchPrimitive.Thumb>
    </span>
  </SwitchPrimitive.Root>;
}
