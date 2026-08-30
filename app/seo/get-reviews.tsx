/**
 * GET REVIEWS. Route: `/seo/get-reviews`. Feature owner: Pranay.
 *
 * The review-request generator: Grexa's "Get Reviews from Your Customers" home
 * block, opened out into a screen and rebuilt around what Shoogle can actually
 * stand behind.
 *
 * WHY THIS IS THE HIGHEST-LEVERAGE SCREEN IN THE PRODUCT
 * -----------------------------------------------------
 * For a salon, clinic or driving school in Navi Mumbai, review volume and
 * recency are among the few inputs to local ranking that the owner can move
 * this afternoon, with no budget and no integration. Everything else on the
 * Business tab is waiting on Google credentials. This screen is not: the link
 * can be pasted, the QR is generated on device, and WhatsApp is already on the
 * phone.
 *
 * THE FOUR HONESTY DECISIONS THIS SCREEN IS BUILT AROUND
 * -----------------------------------------------------
 * 1. NO INVENTED LINK. The review URL is derived from a Google place id, which
 *    only arrives with a connected profile. There is none, so the screen says
 *    exactly that and offers the paste path, rather than rendering a plausible
 *    URL that would send a shop's customers nowhere.
 *
 * 2. REQUESTS SENT IS NOT REVIEWS RECEIVED. Grexa shows one bar toward a review
 *    goal. Google's API carries no attribution of any kind — no referrer, no
 *    campaign — so nothing can link a review to a request. Shoogle shows two
 *    numbers in two cards and says in words that they are not joined.
 *
 * 3. HANDING A DRAFT TO WHATSAPP IS NOT SENDING IT. The count only moves once
 *    the owner confirms. Until then the request is visible and uncounted.
 *
 * 4. THE POLICY GUIDANCE SHIPS WITH THE BUTTON. Incentivised reviews, review
 *    gating and bulk requests can get a listing suspended. Those warnings are on
 *    this screen, not in a help centre.
 *
 * WHERE THE DATA COMES FROM
 * -------------------------
 * The requests count is local and real: AsyncStorage on this phone, written
 * only when the owner confirms. The review count comes from the provider, which
 * today answers `not_connected` for everyone. In development with fixtures on,
 * a labelled fixture profile stands in — under the fixture banner, with a
 * switch for the Voice of Merchant states, because for a small Indian business
 * "not verified" is the likely state rather than the edge case.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { canOpenURL, openURL } from 'expo-linking';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { Screen, TopBar } from '@/components/shared';
import { Card, Tabs, Text, useToast } from '@/components/ui';
import {
  ConfirmSendCard,
  copyToClipboard,
  GoogleRulesCard,
  HowThisWorksCard,
  loadRequestLog,
  NewReviewsCard,
  openWhatsApp,
  parseIndianMobile,
  parsePastedReviewLink,
  recordConfirmedRequest,
  ReviewLinkCard,
  ReviewQrCard,
  reviewLinkForPlaceId,
  reviewRequestMessage,
  SendRequestCard,
  summarise,
  WeeklyRequestsCard,
  type MessageTone,
  type RequestChannel,
  type ReviewCountChange,
  type ReviewLink,
  type ReviewRequestEntry,
  type WeeklyRequestSummary,
} from '@/features/gbp/components/getReviews';
import { classifyVoiceOfMerchant, voiceOfMerchantGate } from '@/features/gbp';
import { businessFixtureIdentity } from '@/fixtures/business';
import { fixtureVoiceOfMerchantStates } from '@/fixtures/gbp';
import {
  getReviewRequestFixtures,
  reviewRequestFixtureState,
} from '@/fixtures/gbp-review-requests';
import { loading, ready, unavailable, type DataState } from '@/lib/state/DataState';
import { useTheme } from '@/theme';

/**
 * Why Shoogle cannot look the link up. This is the sentence the whole
 * not-connected state hangs on, so it names the mechanism rather than
 * apologising.
 */
const LINK_UNKNOWN_REASON =
  'Your review link is built from your Google place id, and the place id only comes from a ' +
  'connected Google Business Profile. No Google account is connected yet, so Shoogle has no ' +
  'place id and will not guess one. Paste the link Google already gives you and everything on ' +
  'this screen works today.';

const REVIEWS_NOT_CONNECTED =
  'No Google Business Profile is connected, so Shoogle cannot read how many reviews you have. ' +
  'That number is unknown, not zero.';

const NO_LINK_YET = 'Add your review link first — there is nothing to send without it.';

/** Fixture-only Voice of Merchant views, so the blocked states are walkable. */
type FixtureProfileView = 'verified' | 'verify' | 'ownership_conflict';

const FIXTURE_VIEWS: { value: FixtureProfileView; label: string }[] = [
  { value: 'verified', label: 'Verified' },
  { value: 'verify', label: 'Not verified' },
  { value: 'ownership_conflict', label: 'Owned by someone else' },
];

export default function GetReviewsScreen() {
  const theme = useTheme();
  const toast = useToast();

  // Gated accessor: null outside development, so a release build cannot reach
  // fixture content at all.
  const fixtures = useMemo(() => getReviewRequestFixtures(), []);
  const isFixture = fixtures !== null;

  const [fixtureView, setFixtureView] = useState<FixtureProfileView>('verified');

  /* ---------------------------------------------------------------------- */
  /* The link                                                               */
  /* ---------------------------------------------------------------------- */

  const [link, setLink] = useState<ReviewLink | null>(() =>
    fixtures === null ? null : reviewLinkForPlaceId(fixtures.placeId),
  );
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const handleUseDraft = useCallback(() => {
    const parsed = parsePastedReviewLink(draft);
    if (!parsed.ok) {
      setDraftError(parsed.message);
      return;
    }
    setDraftError(null);
    setLink(parsed.link);
    setDraft('');
    toast.show({
      message: parsed.link.opensReviewFormForSure
        ? 'Review link saved. The QR below is that link.'
        : 'Link saved. Open it once yourself to check it lands on the review box.',
      tone: parsed.link.opensReviewFormForSure ? 'success' : 'warning',
      durationMs: 4500,
    });
  }, [draft, toast]);

  const handleClearLink = useCallback(() => {
    setLink(null);
    setDraftError(null);
  }, []);

  const handleCopyLink = useCallback(() => {
    if (link === null) return;
    const outcome = copyToClipboard(link.url);
    toast.show(
      outcome.ok
        ? { message: 'Review link copied.', tone: 'success' }
        : { message: outcome.message, tone: 'error', durationMs: 6000 },
    );
  }, [link, toast]);

  /* ---------------------------------------------------------------------- */
  /* The message                                                            */
  /* ---------------------------------------------------------------------- */

  const businessName = isFixture ? businessFixtureIdentity.name : null;

  const [tone, setTone] = useState<MessageTone>('english');
  const [message, setMessage] = useState('');
  const messageTouched = useRef(false);

  useEffect(() => {
    if (messageTouched.current) return;
    setMessage(
      link === null
        ? ''
        : reviewRequestMessage({ businessName, url: link.url, tone }),
    );
  }, [businessName, link, tone]);

  const handleChangeMessage = useCallback((value: string) => {
    messageTouched.current = true;
    setMessage(value);
  }, []);

  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const handleChangePhone = useCallback((value: string) => {
    setPhone(value);
    setPhoneError(null);
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Requests sent — local, real, and only counted once confirmed           */
  /* ---------------------------------------------------------------------- */

  /**
   * Fixture mode is seeded at mount and never touches the device's real log —
   * writing invented requests into AsyncStorage would leave them behind after
   * fixtures were switched off, and they would then be indistinguishable from
   * requests the owner actually sent.
   */
  const [entries, setEntries] = useState<ReviewRequestEntry[]>(() =>
    fixtures === null ? [] : fixtures.buildRequestLog(new Date()),
  );
  const [requestState, setRequestState] = useState<DataState<WeeklyRequestSummary>>(() => {
    if (fixtures === null) return loading();
    const now = new Date();
    return reviewRequestFixtureState(summarise(fixtures.buildRequestLog(now), now));
  });
  const [pending, setPending] = useState<RequestChannel[]>([]);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (fixtures !== null) return;
    let cancelled = false;
    void loadRequestLog(AsyncStorage, new Date()).then((next) => {
      if (cancelled) return;
      setRequestState(next);
      setEntries(next.status === 'ready' ? [...next.value.entries] : []);
    });
    return () => {
      cancelled = true;
    };
  }, [fixtures, reloadToken]);

  const confirmOldestPending = useCallback(
    async (sent: boolean) => {
      const channel = pending[0];
      if (channel === undefined) return;
      setPending((current) => current.slice(1));

      if (!sent) {
        toast.show({ message: 'Not counted. Nothing was recorded.', tone: 'neutral' });
        return;
      }

      const now = new Date();
      const entry: ReviewRequestEntry = {
        id: `req-${now.getTime()}-${Math.floor(Math.random() * 100000)}`,
        confirmedAt: now.toISOString(),
        channel,
      };

      if (fixtures !== null) {
        // Fixture mode never writes to the device's real log.
        const next = [entry, ...entries];
        setEntries(next);
        setRequestState(reviewRequestFixtureState(summarise(next, now)));
        return;
      }

      const result = await recordConfirmedRequest(AsyncStorage, entry, now, entries);
      setEntries([...result.summary.entries]);
      setRequestState(ready(result.summary, now.toISOString()));
      if (!result.persisted) {
        toast.show({
          message:
            'Counted for now, but this phone would not save it — the count may be lower after you restart Shoogle.',
          tone: 'warning',
          durationMs: 6000,
        });
      }
    },
    [entries, fixtures, pending, toast],
  );

  /* ---------------------------------------------------------------------- */
  /* Sending                                                                */
  /* ---------------------------------------------------------------------- */

  const handleSendWhatsApp = useCallback(async () => {
    if (link === null) return;

    const parsedPhone = parseIndianMobile(phone);
    if (parsedPhone.ok === false) {
      setPhoneError(parsedPhone.message);
      return;
    }
    setPhoneError(null);

    // Named imports, assembled here, rather than `import * as Linking`. Babel's
    // wildcard interop COPIES the namespace, so a test can never intercept a
    // call made through one — the WhatsApp assertions would silently pass
    // against the real module and this screen's only external side effect would
    // be untested.
    const handoff = await openWhatsApp(
      { openURL, canOpenURL },
      {
        waNumber: parsedPhone.ok === true ? parsedPhone.wa : null,
        text: message,
      },
    );

    if (handoff.status === 'failed') {
      toast.show({ message: handoff.message, tone: 'error', durationMs: 6000 });
      return;
    }

    setPending((current) => [...current, 'whatsapp']);
    toast.show({
      message: handoff.whatsappDetected
        ? 'WhatsApp opened. Come back and tell Shoogle whether it went.'
        : 'Opened wa.me. If WhatsApp is not installed this opens in your browser instead.',
      tone: handoff.whatsappDetected ? 'neutral' : 'warning',
      durationMs: 5500,
    });
  }, [link, message, phone, toast]);

  const handleShareAnotherWay = useCallback(async () => {
    if (link === null) return;
    try {
      const result = await Share.share({ message });
      if (result.action === Share.sharedAction) {
        setPending((current) => [...current, 'shared']);
      }
    } catch {
      toast.show({
        message: 'This phone would not open the share sheet. Copy the message instead.',
        tone: 'error',
        durationMs: 6000,
      });
    }
  }, [link, message, toast]);

  const handleCopyMessage = useCallback(() => {
    const outcome = copyToClipboard(message);
    if (!outcome.ok) {
      toast.show({ message: outcome.message, tone: 'error', durationMs: 6000 });
      return;
    }
    setPending((current) => [...current, 'in_person']);
    toast.show({ message: 'Message copied. Tell Shoogle when it has gone out.', tone: 'success' });
  }, [message, toast]);

  /* ---------------------------------------------------------------------- */
  /* Reviews — the number Shoogle did NOT cause                             */
  /* ---------------------------------------------------------------------- */

  const reviewState = useMemo<DataState<ReviewCountChange>>(() => {
    if (fixtures === null) return unavailable('not_connected', REVIEWS_NOT_CONNECTED);
    if (fixtureView === 'verified') return reviewRequestFixtureState(fixtures.reviewCount);

    // Reviews are documented as readable only for a VERIFIED location, so the
    // Voice of Merchant outcome — not a generic error — is what is shown.
    const outcome = classifyVoiceOfMerchant(fixtureVoiceOfMerchantStates[fixtureView]);
    return voiceOfMerchantGate(outcome) ?? reviewRequestFixtureState(fixtures.reviewCount);
  }, [fixtures, fixtureView]);

  return (
    <Screen
      testID="get-reviews-screen"
      header={<TopBar title="Get reviews" />}
      edgeBottom
      showsFixtureData={isFixture}>
      <Text variant="screenTitle" accessibilityRole="header">
        Get more reviews
      </Text>
      <Text variant="body" tone="muted" style={{ marginTop: 6 }}>
        Reviews are the one thing on your Google listing you can move today. Ask one customer at a
        time, right after their visit.
      </Text>

      {isFixture ? (
        <View style={{ marginTop: theme.spacing.lg }}>
          <Text variant="label" tone="muted2">
            FIXTURE PROFILE STATE
          </Text>
          <Tabs
            testID="fixture-view-switch"
            items={FIXTURE_VIEWS}
            value={fixtureView}
            onChange={setFixtureView}
            accessibilityLabel="Fixture Google profile state"
            style={{ marginTop: theme.spacing.sm }}
          />
        </View>
      ) : null}

      <View style={[styles.stack, { marginTop: theme.spacing.xl }]}>
        <WeeklyRequestsCard
          testID="weekly-requests-card"
          state={requestState}
          awaitingConfirmation={pending.length}
          onRetry={() => setReloadToken((token) => token + 1)}
        />

        <NewReviewsCard testID="new-reviews-card" state={reviewState} />

        <ConfirmSendCard
          testID="confirm-send-card"
          pending={pending.length}
          onConfirmSent={() => {
            void confirmOldestPending(true);
          }}
          onConfirmNotSent={() => {
            void confirmOldestPending(false);
          }}
        />

        <ReviewLinkCard
          testID="review-link-card"
          link={link}
          unknownReason={LINK_UNKNOWN_REASON}
          draft={draft}
          onChangeDraft={(value) => {
            setDraft(value);
            setDraftError(null);
          }}
          draftError={draftError}
          onUseDraft={handleUseDraft}
          onClearLink={handleClearLink}
          onCopyLink={handleCopyLink}
          onWhereIsMyLink={() => setHelpOpen((open) => !open)}
        />

        {helpOpen && link === null ? <WhereIsMyLinkCard /> : null}

        {link !== null ? <ReviewQrCard testID="review-qr-card" link={link} /> : null}

        <SendRequestCard
          testID="send-request-card"
          phone={phone}
          onChangePhone={handleChangePhone}
          phoneError={phoneError}
          tone={tone}
          onChangeTone={setTone}
          message={message}
          onChangeMessage={handleChangeMessage}
          disabledReason={link === null ? NO_LINK_YET : null}
          onSendWhatsApp={() => {
            void handleSendWhatsApp();
          }}
          onShareAnotherWay={() => {
            void handleShareAnotherWay();
          }}
          onCopyMessage={handleCopyMessage}
        />

        <HowThisWorksCard testID="how-this-works-card" />
        <GoogleRulesCard testID="google-rules-card" />
      </View>
    </Screen>
  );
}

/**
 * Where the link lives, spelled out.
 *
 * Rendered inline rather than opening a Google support URL: a deep link into a
 * help centre is a promise about someone else's site that we cannot keep, and
 * these four steps are the whole answer anyway.
 */
function WhereIsMyLinkCard() {
  const theme = useTheme();

  const steps = [
    'Open the Google Maps app, signed in with the account that manages the business.',
    'Tap your business profile, then "Ask for reviews".',
    'Google shows a short link — copy it.',
    'Paste it above. It usually looks like https://g.page/r/…/review.',
  ];

  return (
    <Card testID="where-is-my-link" flat>
      <Text variant="bodyStrong">Finding your review link</Text>
      {steps.map((step, index) => (
        <View key={step} style={[styles.stepRow, { marginTop: theme.spacing.sm }]}>
          <Text variant="caption" tone="muted2" style={styles.stepNumber}>
            {`${index + 1}.`}
          </Text>
          <Text variant="caption" tone="muted" style={{ flex: 1 }}>
            {step}
          </Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start' },
  stepNumber: { width: 20 },
});
