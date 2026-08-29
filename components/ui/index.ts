/**
 * Shoogle design-system primitives.
 *
 * Import from '@/components/ui' - never reach into an individual file, so the
 * barrel stays the single public surface of the design system.
 *
 * These primitives are SHARED. If you need a variant, add a prop here and add a
 * test. Do not fork a copy into your feature folder, and do not restyle one
 * inline with hard-coded colours or sizes.
 */
export { Avatar, initialsFor } from './Avatar';
export { Badge, PostStatusBadge } from './Badge';
export { BottomSheet } from './BottomSheet';
export { Button } from './Button';
export { Card } from './Card';
export { Dialog } from './Dialog';
export { Divider } from './Divider';
export { EmptyState } from './EmptyState';
export { ErrorState } from './ErrorState';
export { IconButton } from './IconButton';
export { Input } from './Input';
export { Metric, formatMetricValue, UNKNOWN_VALUE_PLACEHOLDER } from './Metric';
export { Navigation, PRIMARY_NAVIGATION } from './Navigation';
export { PageHeader } from './PageHeader';
export { Score, scoreBand } from './Score';
export { Section } from './Section';
export { Select } from './Select';
export { Skeleton, SkeletonLines } from './Skeleton';
export { Tabs } from './Tabs';
export { Text } from './Text';
export { Textarea, countCharacters } from './Textarea';
export { ToastProvider, useToast } from './Toast';

export type { AvatarProps } from './Avatar';
export type { BadgeProps } from './Badge';
export type { BottomSheetProps } from './BottomSheet';
export type { ButtonProps, ButtonSize, ButtonVariant } from './Button';
export type { CardProps } from './Card';
export type { DialogProps } from './Dialog';
export type { DividerProps } from './Divider';
export type { EmptyStateProps } from './EmptyState';
export type { ErrorStateProps } from './ErrorState';
export type { IconButtonProps } from './IconButton';
export type { InputProps } from './Input';
export type { MetricProps, MetricUnit } from './Metric';
export type { NavigationItem, NavigationProps } from './Navigation';
export type { PageHeaderProps } from './PageHeader';
export type { ScoreProps } from './Score';
export type { SectionProps } from './Section';
export type { SelectOption, SelectProps } from './Select';
export type { SkeletonProps } from './Skeleton';
export type { TabItem, TabsProps } from './Tabs';
export type { TextProps } from './Text';
export type { TextareaProps } from './Textarea';
export type { ToastOptions, ToastTone } from './Toast';
