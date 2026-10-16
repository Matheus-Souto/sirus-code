import { Platform, View } from "react-native";
import { useResolveClassNames } from "uniwind";

import { SymbolView } from "./AppSymbol";
import { ListRowLayout } from "./ListRowLayout";
import { MaterialRadioIndicator } from "./MaterialRadioIndicator";
import { RowPressable } from "./RowPressable";

export function ListChoiceRow(props: {
  readonly label: string;
  readonly description?: string;
  readonly selected: boolean;
  readonly separated?: boolean;
  readonly disabled?: boolean;
  readonly onPress: () => void;
}) {
  const rippleStyle = useResolveClassNames("bg-subtle-strong");
  return (
    <RowPressable
      accessibilityRole="radio"
      accessibilityLabel={props.label}
      accessibilityHint={props.description}
      accessibilityState={{ checked: props.selected, disabled: Boolean(props.disabled) }}
      disabled={props.disabled}
      onPress={props.onPress}
      android_ripple={{ color: rippleStyle.backgroundColor }}
      unstable_pressDelay={Platform.OS === "android" ? 50 : undefined}
      // Only the checkmark marks the choice, no fill or divider.
      className="bg-grouped-card"
    >
      <ListRowLayout
        label={props.label}
        description={props.description}
        disabled={props.disabled}
        accessory={
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            className="size-6 items-center justify-center"
          >
            {Platform.OS === "android" ? (
              <MaterialRadioIndicator selected={props.selected} />
            ) : props.selected ? (
              <SymbolView
                name="checkmark"
                size={18}
                tintColorClassName="accent-foreground"
                type="monochrome"
                weight="semibold"
              />
            ) : null}
          </View>
        }
      />
    </RowPressable>
  );
}
