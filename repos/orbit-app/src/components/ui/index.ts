// R04 App component library. Import from here: `import { Button, useToast } from "src/components/ui"`.
// Colours, radius, type and motion come from tokens (R01), icons from <Icon> (R02),
// fixed wording from the standard copy (R03). Usage notes: R04-app-components/REPORT.md.
export { Icon, type IconName, type IconSize } from "./Icon";
export { UiText } from "./Text";
export { UiPressable } from "./Pressable";
export { ReducedMotionOverride, useReducedMotion } from "./motion";
// basics
export { Button, type ButtonVariant } from "./Button";
export { IconButton } from "./IconButton";
export { Card } from "./Card";
export { Chip, type ChipTone } from "./Chip";
export { Avatar, AvatarStack } from "./Avatar";
export { MacTile } from "./MacTile";
export { ListRow } from "./ListRow";
export { SwipeRow, type SwipeAction } from "./SwipeRow";
export { SearchField } from "./SearchField";
export { TextField } from "./TextField";
export { Accordion } from "./Accordion";
export { GlassSurface } from "./GlassSurface";
// feedback
export { UiPortalHost } from "./Portal";
export { ToastProvider, useToast } from "./Toast";
export { ConfirmDialog } from "./ConfirmDialog";
export { ActionSheet, type ActionSheetOption } from "./ActionSheet";
export { BottomSheet } from "./BottomSheet";
export { FullDrawer } from "./FullDrawer";
export { UiFeedbackHost, presentActionSheet, presentConfirm } from "./feedback-host";
// AI
export { ConfirmCard } from "./ConfirmCard";
export { WhyDisclosure } from "./WhyDisclosure";
// controls
export { Toggle } from "./Toggle";
export { CheckCircle, Checkbox, Radio } from "./Checks";
export { Segmented, SwipeSegments, type Segment } from "./Segmented";
export { CategoryTabs, FilterOption } from "./Filters";
export { CountUp, ProgressBar, RingChart } from "./Progress";
// states
export { DegradedCard, EmptyState, OfflineBar, QuotaChip, RetryCard, SampleBar, SampleTag, Skeleton } from "./States";
