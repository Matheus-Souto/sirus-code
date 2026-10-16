import { registerRootComponent } from "expo";
import "react-native-gesture-handler";
import { featureFlags } from "react-native-screens";

import App from "./src/App";

// react-native-screens' iOS FormSheet sizing needs synchronous updates.
featureFlags.experiment.synchronousScreenUpdatesEnabled = true;

registerRootComponent(App);
