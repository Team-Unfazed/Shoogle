import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Input, Tabs, Text, Textarea } from '@/components/ui';
import { useTheme } from '@/theme';

import type { MessageTone } from './message';

/**
 * The send flow: who, what, and which app.
 *
 * WHY THE PHONE NUMBER IS OPTIONAL
 * --------------------------------
 * Grexa pairs its number field with a contacts-picker button, which needs the
 * contacts permission — a heavy ask for a shop owner, and one Google Play makes
 * you justify. `wa.me` with no number opens WhatsApp's own contact picker, so
 * leaving the field blank gets the same outcome with no permission at all. The
 * button label changes to say which of the two will happen, so the control
 * never does something other than what it says.
 *
 * WHY EVERY DISABLED CONTROL CARRIES A REASON
 * -------------------------------------------
 * With no review link there is nothing to send, so the send buttons are
 * disabled — and `disabledReason` is rendered next to them. CONTRIBUTING rule
 * 7: a control that does nothing must say why, and a greyed button with no
 * explanation is exactly the dead control that rule bans.
 */
export interface SendRequestCardProps {
  phone: string;
  onChangePhone: (value: string) => void;
  phoneError: string | null;

  tone: MessageTone;
  onChangeTone: (tone: MessageTone) => void;

  message: string;
  onChangeMessage: (value: string) => void;

  /** Null when sending is possible; otherwise why it is not. */
  disabledReason: string | null;

  onSendWhatsApp: () => void;
  onShareAnotherWay: () => void;
  onCopyMessage: () => void;
  testID?: string;
}

const TONE_ITEMS: { value: MessageTone; label: string }[] = [
  { value: 'english', label: 'English' },
  { value: 'hinglish', label: 'Hinglish' },
];

export function SendRequestCard({
  phone,
  onChangePhone,
  phoneError,
  tone,
  onChangeTone,
  message,
  onChangeMessage,
  disabledReason,
  onSendWhatsApp,
  onShareAnotherWay,
  onCopyMessage,
  testID,
}: SendRequestCardProps) {
  const theme = useTheme();
  const blocked = disabledReason !== null;
  const hasNumber = phone.trim().length > 0;

  return (
    <Card testID={testID}>
      <Text variant="cardTitle">Ask a customer</Text>
      <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
        Best within a day of their visit, one person at a time.
      </Text>

      <Input
        testID="send-phone"
        label="Customer mobile (optional)"
        value={phone}
        onChangeText={onChangePhone}
        error={phoneError}
        hint="Leave blank to pick the contact inside WhatsApp."
        placeholder="98765 43210"
        keyboardType="phone-pad"
        inputMode="tel"
        autoComplete="tel"
        maxLength={18}
        containerStyle={{ marginTop: theme.spacing.lg }}
      />

      <Text variant="label" tone="muted2" style={{ marginTop: theme.spacing.lg }}>
        MESSAGE LANGUAGE
      </Text>
      <Tabs
        testID="send-tone"
        items={TONE_ITEMS}
        value={tone}
        onChange={onChangeTone}
        accessibilityLabel="Message language"
        style={{ marginTop: theme.spacing.sm }}
      />

      <Textarea
        testID="send-message"
        label="Message"
        value={message}
        onChangeText={onChangeMessage}
        minHeight={132}
        hint="Edit it to sound like you. Do not offer anything in return for a review."
        containerStyle={{ marginTop: theme.spacing.lg }}
      />

      <Button
        testID="send-whatsapp"
        label={hasNumber ? 'Send on WhatsApp' : 'Choose contact in WhatsApp'}
        onPress={onSendWhatsApp}
        disabled={blocked}
        accessibilityHint={
          disabledReason ??
          'Opens WhatsApp with this message ready to send. You confirm afterwards whether it went.'
        }
        leading={<Ionicons name="logo-whatsapp" size={19} color={theme.colors.onAccent} />}
        style={{ marginTop: theme.spacing.lg }}
      />

      <View style={[styles.secondaryRow, { marginTop: theme.spacing.md }]}>
        <Button
          testID="send-share"
          label="Share another way"
          variant="secondary"
          size="medium"
          fullWidth={false}
          disabled={blocked}
          onPress={onShareAnotherWay}
          style={styles.secondary}
        />
        <Button
          testID="send-copy-message"
          label="Copy message"
          variant="ghost"
          size="medium"
          fullWidth={false}
          disabled={blocked}
          onPress={onCopyMessage}
          style={styles.secondary}
        />
      </View>

      {blocked ? (
        <Text
          testID="send-disabled-reason"
          variant="caption"
          tone="amber"
          style={{ marginTop: theme.spacing.md }}>
          {disabledReason}
        </Text>
      ) : null}
    </Card>
  );
}

/**
 * The step between "WhatsApp opened" and "a request was sent".
 *
 * Shoogle handed a draft to another app. Whether the owner pressed send inside
 * WhatsApp is genuinely unknown to us, and the weekly count is only as
 * trustworthy as this distinction. One tap resolves it; until then the request
 * sits here, visibly uncounted.
 */
export interface ConfirmSendCardProps {
  /** How many handoffs are waiting. Each confirmation resolves the oldest. */
  pending: number;
  onConfirmSent: () => void;
  onConfirmNotSent: () => void;
  testID?: string;
}

export function ConfirmSendCard({
  pending,
  onConfirmSent,
  onConfirmNotSent,
  testID,
}: ConfirmSendCardProps) {
  const theme = useTheme();
  if (pending <= 0) return null;

  return (
    <Card testID={testID} accent="amber">
      <Text variant="cardTitle">Did it go out?</Text>
      <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
        {pending === 1
          ? 'Shoogle opened WhatsApp with your message. It cannot see whether you pressed send, so it will not count the request until you say.'
          : `Shoogle opened WhatsApp ${pending} times. It cannot see whether you pressed send, so nothing is counted until you say.`}
      </Text>

      <View style={[styles.secondaryRow, { marginTop: theme.spacing.lg }]}>
        <Button
          testID="confirm-sent"
          label="Yes, I sent it"
          size="medium"
          fullWidth={false}
          onPress={onConfirmSent}
          style={styles.secondary}
        />
        <Button
          testID="confirm-not-sent"
          label="No"
          variant="secondary"
          size="medium"
          fullWidth={false}
          onPress={onConfirmNotSent}
          style={styles.secondary}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  secondaryRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  secondary: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
});
