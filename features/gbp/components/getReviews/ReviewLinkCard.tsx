import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Input, Text } from '@/components/ui';
import { useTheme } from '@/theme';

import { QrCode, QrUnavailable } from './QrCode';
import { encodeQr, type QrMatrix } from './qr';
import { describeReviewLink, type ReviewLink } from './reviewLink';

/**
 * The review link, in whichever of its three honest states applies.
 *
 * 1. KNOWN, because a connected profile gave us its place id.
 * 2. KNOWN, because the owner pasted it. Identical usefulness, different
 *    provenance, and the provenance is on screen — `prefilledFrom` on the input
 *    exists in this design system precisely so an owner can tell what they
 *    typed from what was retrieved.
 * 3. NOT KNOWN, with the reason. This is today's default and it is not an
 *    error: no Google credentials exist, so no place id exists, so the link
 *    cannot be constructed. The card says that in one sentence and then gives
 *    the owner a way to get on with it.
 *
 * The one thing this card will not do is show a link Shoogle guessed.
 */
export interface ReviewLinkCardProps {
  link: ReviewLink | null;
  /** Why the link is unknown. Rendered only when `link` is null. */
  unknownReason: string;
  draft: string;
  onChangeDraft: (value: string) => void;
  /** Validation message for the pasted value, or null. */
  draftError: string | null;
  onUseDraft: () => void;
  onClearLink: () => void;
  onCopyLink: () => void;
  /** Opens Google's help on where the link lives. */
  onWhereIsMyLink: () => void;
  testID?: string;
}

export function ReviewLinkCard({
  link,
  unknownReason,
  draft,
  onChangeDraft,
  draftError,
  onUseDraft,
  onClearLink,
  onCopyLink,
  onWhereIsMyLink,
  testID,
}: ReviewLinkCardProps) {
  const theme = useTheme();

  if (link === null) {
    return (
      <Card testID={testID} accent="amber">
        <View style={styles.headerRow}>
          <Text variant="cardTitle">Your Google review link</Text>
          <Badge label="Not known yet" accent="amber" />
        </View>

        <Text variant="body" tone="muted" style={{ marginTop: theme.spacing.sm }}>
          {unknownReason}
        </Text>

        <View
          style={[
            styles.paste,
            {
              marginTop: theme.spacing.lg,
              borderTopColor: theme.colors.border,
              paddingTop: theme.spacing.lg,
            },
          ]}>
          <Input
            testID="review-link-input"
            label="Paste your review link"
            value={draft}
            onChangeText={onChangeDraft}
            error={draftError}
            hint="Google Business Profile › Ask for reviews › Copy link"
            placeholder="https://g.page/r/…/review"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            inputMode="url"
            returnKeyType="done"
            onSubmitEditing={onUseDraft}
          />

          <Button
            testID="review-link-use"
            label="Use this link"
            onPress={onUseDraft}
            size="medium"
            disabled={draft.trim().length === 0}
            accessibilityHint="Checks the link is a Google review link, then builds the QR code"
            style={{ marginTop: theme.spacing.md }}
          />

          <Button
            testID="review-link-help"
            label="Where do I find this?"
            variant="ghost"
            size="small"
            onPress={onWhereIsMyLink}
          />
        </View>
      </Card>
    );
  }

  const derived = link.source === 'derived_from_place_id';

  return (
    <Card testID={testID} accent="green">
      <View style={styles.headerRow}>
        <Text variant="cardTitle">Your Google review link</Text>
        <Badge
          label={derived ? 'From Google' : 'You pasted this'}
          accent={derived ? 'green' : 'neutral'}
        />
      </View>

      <View
        style={[
          styles.urlBox,
          {
            marginTop: theme.spacing.md,
            backgroundColor: theme.colors.card2,
            borderRadius: theme.radii.lg,
            padding: theme.spacing.md,
          },
        ]}>
        <Text
          testID="review-link-url"
          variant="caption"
          selectable
          style={{ fontFamily: theme.fontFamily.medium }}>
          {link.url}
        </Text>
      </View>

      <View style={[styles.noteRow, { marginTop: theme.spacing.sm }]}>
        <Ionicons
          name={link.opensReviewFormForSure ? 'checkmark-circle-outline' : 'alert-circle-outline'}
          size={16}
          color={link.opensReviewFormForSure ? theme.colors.green : theme.colors.amber}
          style={{ marginTop: 1 }}
        />
        <Text
          testID="review-link-provenance"
          variant="caption"
          tone="muted"
          style={{ flex: 1, marginLeft: theme.spacing.sm }}>
          {describeReviewLink(link)}
        </Text>
      </View>

      <View style={[styles.actions, { marginTop: theme.spacing.lg }]}>
        <Button
          testID="review-link-copy"
          label="Copy link"
          variant="secondary"
          size="medium"
          fullWidth={false}
          onPress={onCopyLink}
          leading={<Ionicons name="copy-outline" size={17} color={theme.colors.text} />}
          style={styles.action}
        />
        <Button
          testID="review-link-change"
          label={derived ? 'Use a different link' : 'Change link'}
          variant="ghost"
          size="medium"
          fullWidth={false}
          onPress={onClearLink}
          style={styles.action}
        />
      </View>
    </Card>
  );
}

/**
 * The printable code.
 *
 * Split from the link card so the encoder failure has somewhere honest to land:
 * if a link is too long to encode, the link itself still works and still gets
 * shared — only this card changes, and it says why.
 */
export function ReviewQrCard({ link, testID }: { link: ReviewLink; testID?: string }) {
  const theme = useTheme();
  const encoded = encodeQr(link.url);

  return (
    <Card testID={testID}>
      <Text variant="cardTitle">Print this for your counter</Text>
      <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
        A customer scans this with their phone camera and lands on your review box. This is the
        same link as above — nothing else is encoded in it.
      </Text>

      <View style={[styles.qrWrap, { marginTop: theme.spacing.lg }]}>
        {encoded.ok ? (
          <QrCodeFrame matrix={encoded.matrix} url={link.url} />
        ) : (
          <QrUnavailable testID="review-qr-unavailable" message={encoded.message} />
        )}
      </View>

      <Text variant="caption" tone="muted2" align="center" style={{ marginTop: theme.spacing.md }}>
        Take a screenshot to print it. Shoogle cannot print or save to your gallery yet.
      </Text>
    </Card>
  );
}

function QrCodeFrame({ matrix, url }: { matrix: QrMatrix; url: string }) {
  return (
    <QrCode
      testID="review-qr"
      matrix={matrix}
      accessibilityLabel={`QR code for your Google review link, ${url}`}
    />
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  paste: { borderTopWidth: StyleSheet.hairlineWidth },
  urlBox: { minWidth: 0 },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start' },
  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  action: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  qrWrap: { alignItems: 'center' },
});
