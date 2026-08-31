/**
 * THE REVIEWS SURFACE — every state it renders, and the claims it must never make.
 *
 * The mappers, the Voice of Merchant classifier and the error classifier all
 * have their own tests. These are about what an OWNER SEES, which is where the
 * expensive lies live:
 *
 *  1. A REPLY SITTING IN MODERATION IS NEVER SHOWN AS LIVE. Google moderates
 *     replies, so "submitted" and "published" are different facts. Every one of
 *     the seven `GbpReplyModeration` kinds is rendered here and checked against
 *     the four presentations it is allowed to have.
 *  2. UNKNOWN IS NOT ZERO, AND ZERO IS NOT UNKNOWN. The same screen is rendered
 *     with a measured zero and with an unknown, and the two must look different.
 *  3. THE VERIFICATION STATES ARE FIRST-CLASS. All four Voice of Merchant
 *     remedial outcomes render their own copy and say why there is no list —
 *     never an empty list that reads as "you have no reviews".
 *  4. THERE IS NO UNANSWERED FILTER AND NO UNANSWERED COUNT, and the screen says
 *     why rather than leaving an absence.
 *  5. NO RANK POSITION IS EVER ON SCREEN.
 *  6. SUBMITTING IS NOT PUBLISHING. The composer states that before the owner
 *     commits, and the outcome reports only what the adapter returned.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';

import ReviewReplyScreen from '@/app/seo/review-reply';
import ReviewsScreen from '@/app/seo/reviews';
import { ToastProvider } from '@/components/ui';
import { buildReviewsScenarios, buildFixtureReviewPage } from '@/fixtures/gbp-reviews';
import { ThemeProvider } from '@/theme';

import {
  ReplyStatePanel,
  ReviewsList,
  RatingSummaryCard,
  filterReviews,
  formatReviewDate,
  isPublishedOnGoogle,
  reviewFilterOptions,
  summariseReviews,
} from '../components/reviews';
import type { GbpReplyModeration, GbpReviewDetail, GbpReviewPage } from '../types';

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

let mockFixtures = false;
jest.mock('@/lib/env', () => {
  const actual = jest.requireActual('@/lib/env');
  return {
    ...actual,
    isFixtureModeEnabled: () => mockFixtures,
    isDevPreviewEnabled: () => false,
    isSupabaseConfigured: () => false,
  };
});

/**
 * The development Gemini client reads a NON-public key from `process.env`.
 * Clearing both names makes its readiness deterministic here rather than
 * dependent on whichever engineer's machine runs the suite.
 */
const savedKeys = {
  key: process.env['GEMINI_API_KEY'],
  publicKey: process.env['EXPO_PUBLIC_GEMINI_API_KEY'],
};

beforeAll(() => {
  delete process.env['GEMINI_API_KEY'];
  delete process.env['EXPO_PUBLIC_GEMINI_API_KEY'];
});

afterAll(() => {
  if (savedKeys.key !== undefined) process.env['GEMINI_API_KEY'] = savedKeys.key;
  if (savedKeys.publicKey !== undefined) {
    process.env['EXPO_PUBLIC_GEMINI_API_KEY'] = savedKeys.publicKey;
  }
});

afterEach(() => {
  mockFixtures = false;
});

function wrap(children: ReactNode) {
  return (
    <ThemeProvider forceScheme="light">
      <ToastProvider>{children}</ToastProvider>
    </ThemeProvider>
  );
}

async function renderPiece(element: React.JSX.Element) {
  return render(wrap(element));
}

async function renderReviews() {
  return renderRouter(
    {
      'seo/reviews': () => wrap(<ReviewsScreen />),
      'seo/review-reply': () => wrap(<ReviewReplyScreen />),
    },
    { initialUrl: '/seo/reviews' },
  );
}

async function renderReply(reviewId: string) {
  return renderRouter(
    {
      'seo/reviews': () => wrap(<ReviewsScreen />),
      'seo/review-reply': () => wrap(<ReviewReplyScreen />),
    },
    { initialUrl: `/seo/review-reply?reviewId=${reviewId}` },
  );
}

/** Selects a development scenario chip by its id. */
async function selectScenario(id: string) {
  await fireEvent.press(screen.getByTestId(`reviews-scenario-${id}`));
}

/** Every moderation kind the union can hold. Adding one breaks this list. */
const ALL_MODERATIONS: GbpReplyModeration[] = [
  { kind: 'no_reply' },
  { kind: 'published', updateTime: '2020-01-03T00:00:00.000Z' },
  { kind: 'published_time_unknown' },
  { kind: 'pending_moderation', submittedAt: '2020-01-03T00:00:00.000Z' },
  { kind: 'rejected', reason: '[FIXTURE] Example policy reason.', helpUri: null },
  { kind: 'state_not_understood', raw: 'SOMETHING_NEW', submittedAt: null },
  { kind: 'state_not_reported', submittedAt: null },
];

/* -------------------------------------------------------------------------- */
/* 1. Moderation truth                                                        */
/* -------------------------------------------------------------------------- */

describe('a reply in moderation is never shown as live on Google', () => {
  it.each(ALL_MODERATIONS.map((moderation) => [moderation.kind, moderation] as const))(
    'renders %s without claiming more than Google said',
    async (kind, moderation) => {
      await renderPiece(
        <ReplyStatePanel
          moderation={moderation}
          replyComment="[FIXTURE] Example reply text."
          testID="panel"
        />,
      );

      const live = isPublishedOnGoogle(moderation);
      const badge = screen.getByTestId('panel-badge');

      if (live) {
        expect(badge).toHaveTextContent(/Live\ on\ Google/);
      } else {
        // The exact failure this screen exists to prevent: nothing that is not
        // confirmed published may carry the word "Live".
        expect(badge).not.toHaveTextContent(/Live\ on\ Google/);
        expect(screen.queryByText(/Reply is live on Google/)).toBeNull();
      }

      if (kind === 'pending_moderation') {
        expect(badge).toHaveTextContent(/Submitted\ to\ Google/);
      }
      if (kind === 'state_not_understood' || kind === 'state_not_reported') {
        // Google reported something we have not verified. That is SUBMITTED.
        expect(badge).toHaveTextContent(/Submitted\ —\ not\ confirmed/);
      }
      if (kind === 'rejected') {
        expect(badge).toHaveTextContent(/Rejected\ by\ Google/);
        // The refused text stays visible so the owner can write something else.
        expect(screen.getByTestId('panel-text')).toHaveTextContent(/\[FIXTURE\]\ Example\ reply\ text\./);
      }
    },
  );

  it('shows no timestamp at all when Google said "live" but never said when', async () => {
    await renderPiece(
      <ReplyStatePanel
        moderation={{ kind: 'published_time_unknown' }}
        replyComment="[FIXTURE] Example reply text."
        testID="panel"
      />,
    );

    expect(screen.queryByTestId('panel-timestamp')).toBeNull();
    expect(screen.getByTestId('panel-next-step')).toHaveTextContent(/Google\ did\ not\ report\ when\ it\ went\ live/);
  });

  it('never says a reply exists when there is none', async () => {
    await renderPiece(
      <ReplyStatePanel moderation={{ kind: 'no_reply' }} replyComment={null} testID="panel" />,
    );
    expect(screen.getByTestId('panel-badge')).toHaveTextContent(/No\ reply\ yet/);
    expect(screen.queryByTestId('panel-text')).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* 2. Unknown vs measured zero                                                */
/* -------------------------------------------------------------------------- */

describe('unknown and zero are different facts on screen', () => {
  it('renders a measured zero as 0 when Google says there are no reviews', async () => {
    const page: GbpReviewPage = {
      reviews: [],
      skipped: [],
      nextPageToken: null,
      averageRating: null,
      totalReviewCount: 0,
    };
    await renderPiece(<RatingSummaryCard summary={summariseReviews(page)} testID="summary" />);

    expect(screen.getByTestId('summary-total')).toHaveTextContent(/0/);
    for (const star of [5, 4, 3, 2, 1]) {
      expect(screen.getByTestId(`summary-bucket-${star}-count`)).toHaveTextContent(/0/);
    }
    expect(screen.getByTestId('summary-note')).toHaveTextContent(/These\ zeros\ were\ measured,\ not\ assumed/);
  });

  it('renders an unknown as a dash with a reason, never as 0', async () => {
    const page: GbpReviewPage = {
      reviews: [],
      skipped: [],
      nextPageToken: null,
      averageRating: null,
      totalReviewCount: null,
    };
    await renderPiece(<RatingSummaryCard summary={summariseReviews(page)} testID="summary" />);

    expect(screen.getByTestId('summary-average')).toHaveTextContent(/—/);
    expect(screen.getByTestId('summary-total')).toHaveTextContent(/—/);
    for (const star of [5, 4, 3, 2, 1]) {
      const count = screen.getByTestId(`summary-bucket-${star}-count`);
      expect(count).toHaveTextContent(/—/);
      expect(count).not.toHaveTextContent(/0/);
    }
    expect(screen.getByTestId('summary-average-reason')).toBeOnTheScreen();
    expect(screen.getByTestId('summary-total-reason')).toBeOnTheScreen();
    expect(screen.getByTestId('summary-note')).toHaveTextContent(/unknown,\ not\ zero/);
  });

  it('never presents an average it computed itself as Google’s figure', () => {
    const page = buildFixtureReviewPage();
    const withoutAverage: GbpReviewPage = { ...page, averageRating: null };
    expect(summariseReviews(withoutAverage).averageRating).toBeNull();
  });

  it('says what the distribution counted when the page is not the whole listing', async () => {
    await renderPiece(
      <RatingSummaryCard summary={summariseReviews(buildFixtureReviewPage())} testID="summary" />,
    );
    // 7 mapped reviews against a listing total of 8.
    expect(screen.getByTestId('summary-note')).toHaveTextContent(/partial\ picture/);
    expect(screen.getByTestId('summary-skipped')).toHaveTextContent(/could\ not\ read/);
  });

  it('counts a review Google sent with no star rating as unrated, not as zero stars', () => {
    const summary = summariseReviews(buildFixtureReviewPage());
    expect(summary.unratedCount).toBe(1);
    const oneStar = summary.buckets.find((bucket) => bucket.stars === 1);
    // The unrated review must not have leaked into the 1-star bucket.
    expect(oneStar?.count).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. Filters                                                                 */
/* -------------------------------------------------------------------------- */

describe('filters only claim what the data supports', () => {
  it('offers no unanswered filter and explains the omission', async () => {
    const page = buildFixtureReviewPage();
    await renderPiece(
      <ReviewsList page={page} filter="all" onFilterChange={jest.fn()} testID="list" />,
    );

    expect(screen.queryByText(/^Unanswered/)).toBeNull();
    expect(screen.getByTestId('list-no-unanswered')).toHaveTextContent(/no\ "unanswered"\ filter\ here/);
  });

  it('never offers an unanswered option in the filter model', () => {
    const options = reviewFilterOptions(buildFixtureReviewPage().reviews);
    expect(options.map((option) => option.value)).not.toContain('unanswered');
  });

  it('says the filter counts cover only the reviews on screen', async () => {
    const page = buildFixtureReviewPage();
    await renderPiece(
      <ReviewsList page={page} filter="all" onFilterChange={jest.fn()} testID="list" />,
    );
    expect(screen.getByTestId('list-filter-scope')).toHaveTextContent(new RegExp(`${page.reviews.length} reviews on this screen`));
  });

  it('filters by star rating over exactly the reviews held', () => {
    const page = buildFixtureReviewPage();
    const fives = filterReviews(page.reviews, 'star_5');
    expect(fives.length).toBeGreaterThan(0);
    expect(fives.every((review) => review.starRating === 5)).toBe(true);

    const unrated = filterReviews(page.reviews, 'unrated');
    expect(unrated.every((review) => review.starRating === null)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* 4. The screen states                                                       */
/* -------------------------------------------------------------------------- */

describe('the reviews screen, not connected — the default state today', () => {
  it('explains why there is nothing, and shows no counts at all', async () => {
    await renderReviews();

    expect(screen.getByTestId('reviews-unavailable')).toBeOnTheScreen();
    expect(screen.getByText('Google Business Profile is not connected')).toBeOnTheScreen();
    // No fixture switcher, no summary, no list — and crucially no zeros.
    expect(screen.queryByTestId('reviews-scenarios')).toBeNull();
    expect(screen.queryByTestId('reviews-summary')).toBeNull();
    expect(screen.queryByTestId('reviews-list')).toBeNull();
  });

  it('carries no fixture banner when there is no fixture data', async () => {
    await renderReviews();
    expect(screen.queryByText(/Fixture data/i)).toBeNull();
  });
});

describe('the reviews screen with fixtures', () => {
  beforeEach(() => {
    mockFixtures = true;
  });

  it('pins the fixture banner over anything invented', async () => {
    await renderReviews();
    expect(screen.getByText(/Fixture data/i)).toBeOnTheScreen();
  });

  it('renders every reply state in one list without merging any two of them', async () => {
    await renderReviews();

    // Submitted, not understood — the state the wire path produces today.
    expect(
      screen.getByTestId('review-fixture-review-0002-reply-badge'),
    ).toHaveTextContent(/Submitted\ —\ not\ confirmed/);
    // Rejected, with Google's reason.
    expect(
      screen.getByTestId('review-fixture-review-0003-reply-badge'),
    ).toHaveTextContent(/Rejected\ by\ Google/);
    // Confirmed in moderation.
    expect(
      screen.getByTestId('review-fixture-review-0006-reply-badge'),
    ).toHaveTextContent(/Submitted\ to\ Google/);
    // Confirmed live.
    expect(
      screen.getByTestId('review-fixture-review-0007-reply-badge'),
    ).toHaveTextContent(/Live\ on\ Google/);
    // No reply at all.
    expect(
      screen.getByTestId('review-fixture-review-0001-reply-badge'),
    ).toHaveTextContent(/No\ reply\ yet/);
  });

  it('admits the list is short when Google sent a review it could not read', async () => {
    await renderReviews();
    expect(screen.getByTestId('reviews-list-skipped')).toHaveTextContent(/could\ not\ be\ read/);
  });

  it('says a rating-only review has no text rather than leaving it blank', async () => {
    await renderReviews();
    expect(screen.getByTestId('review-fixture-review-0004-no-comment')).toHaveTextContent(/left\ a\ rating\ without\ writing\ anything/);
  });

  it('draws no stars for a review Google gave no rating', async () => {
    await renderReviews();
    expect(screen.getByTestId('review-fixture-review-0005-stars')).toHaveTextContent(/Google\ did\ not\ report\ a\ star\ rating/);
  });

  it.each([
    ['verify', 'Not verified with Google yet'],
    ['wait', 'Google is still processing this profile'],
    ['ownership_conflict', 'Someone else manages this listing'],
    ['suspended', 'Google has restricted this profile'],
  ])('renders the %s verification outcome as its own state', async (id, title) => {
    await renderReviews();
    await selectScenario(id);

    expect(screen.getByTestId('reviews-verification-title')).toHaveTextContent(new RegExp(title));
    // The reason there is no list, said before the owner can misread it.
    expect(screen.getByTestId('reviews-verification-reviews-blocked')).toHaveTextContent(/not\ because\ you\ have\ no\ reviews/);
    expect(screen.queryByTestId('reviews-summary')).toBeNull();
  });

  it('offers nothing to press when Google is still processing', async () => {
    await renderReviews();
    await selectScenario('wait');
    expect(screen.getByTestId('reviews-verification-no-action')).toBeOnTheScreen();
    expect(screen.queryByTestId('reviews-verification-owner-action')).toBeNull();
  });

  it('states the next step as words, not as a button Shoogle cannot honour', async () => {
    await renderReviews();
    await selectScenario('verify');
    expect(screen.getByTestId('reviews-verification-owner-action')).toHaveTextContent(/Verify\ this\ business\ with\ Google/);
    expect(screen.getByText(/This happens on Google, not in Shoogle/)).toBeOnTheScreen();
  });

  it('renders the rate-limited state as temporary rather than as an empty list', async () => {
    await renderReviews();
    await selectScenario('rate_limited');

    expect(screen.getByTestId('reviews-rate-limited')).toBeOnTheScreen();
    expect(screen.getByText(/Google is limiting requests right now/)).toBeOnTheScreen();
    expect(screen.queryByTestId('reviews-list')).toBeNull();
  });

  it('shows measured zeros for a verified listing with no reviews', async () => {
    await renderReviews();
    await selectScenario('no_reviews');

    expect(screen.getByTestId('reviews-summary-total')).toHaveTextContent(/0/);
    // The list says the zero is measured rather than showing nothing at all.
    expect(screen.getByTestId('reviews-list-empty')).toBeOnTheScreen();
    expect(screen.getByText(/measured zero, not a gap/)).toBeOnTheScreen();
  });

  it('leaves the average and total unknown when Google did not send them', async () => {
    await renderReviews();
    await selectScenario('no_summary');

    expect(screen.getByTestId('reviews-summary-average')).toHaveTextContent(/—/);
    expect(screen.getByTestId('reviews-summary-total')).toHaveTextContent(/—/);
    expect(screen.getByTestId('reviews-summary-average-reason')).toBeOnTheScreen();
  });

  it('says there are more pages rather than implying this is everything', async () => {
    await renderReviews();
    await selectScenario('no_summary');
    expect(screen.getByTestId('reviews-list-more')).toHaveTextContent(/Loading\ further\ pages\ is\ not\ built\ yet/);
  });
});

/* -------------------------------------------------------------------------- */
/* 5. Nothing that cannot be measured                                         */
/* -------------------------------------------------------------------------- */

describe('the reviews screen never claims what Google does not publish', () => {
  /**
   * Two shapes are banned: a "#4"-style position, and the word rank or position
   * followed by a number in the same sentence. The copy is allowed to SAY that
   * ranks do not exist — that sentence carries no digits, which is exactly the
   * difference.
   */
  it('shows no rank position, connected or not', async () => {
    mockFixtures = true;
    await renderReviews();
    expect(screen.queryAllByText(/#\s?\d/)).toHaveLength(0);
    expect(screen.queryAllByText(/\brank\w*\b[^.]*\d/i)).toHaveLength(0);
    expect(screen.queryAllByText(/\bposition\b[^.]*\d/i)).toHaveLength(0);
    expect(screen.getByText(/No Google API returns a search rank position/)).toBeOnTheScreen();
  });

  it('offers no control to delete or report a review, and says why', async () => {
    mockFixtures = true;
    await renderReviews();
    expect(screen.queryByText(/^Delete review$/)).toBeNull();
    expect(screen.getByTestId('reviews-limits')).toHaveTextContent(/Removing\ a\ review/);
  });
});

/* -------------------------------------------------------------------------- */
/* 6. The reply screen                                                        */
/* -------------------------------------------------------------------------- */

describe('the reply screen, with no review to reply to', () => {
  it('says so and offers nothing to submit', async () => {
    await renderReply('fixture-review-0001');

    expect(screen.getByTestId('review-reply-missing')).toBeOnTheScreen();
    expect(screen.getByTestId('review-reply-submit')).toBeDisabled();
    expect(screen.getByTestId('review-reply-not-connected')).toBeOnTheScreen();
  });
});

describe('the reply screen, with a review', () => {
  beforeEach(() => {
    mockFixtures = true;
  });

  it('shows the review above the composer', async () => {
    await renderReply('fixture-review-0002');
    expect(screen.getByTestId('review-reply-review-comment')).toHaveTextContent(/\[FIXTURE\]\ Example\ critical\ review\ text/);
    expect(screen.getByTestId('review-reply-composer-input')).toBeOnTheScreen();
  });

  it('offers no second "write a reply" button on the reply screen itself', async () => {
    await renderReply('fixture-review-0002');
    expect(screen.queryByTestId('review-reply-review-reply-button')).toBeNull();
  });

  it('states that Google reviews the reply BEFORE the owner can submit it', async () => {
    await renderReply('fixture-review-0002');
    expect(screen.getByTestId('review-reply-composer-moderation-notice')).toHaveTextContent(/reviewed\ by\ Google\ before\ it\ appears/);
    expect(screen.getByText(/it does not put it on your profile/)).toBeOnTheScreen();
  });

  it('warns that submitting replaces an existing reply, moderation and all', async () => {
    await renderReply('fixture-review-0002');
    expect(screen.getByTestId('review-reply-composer-replaces')).toHaveTextContent(/replaces\ a\ reply\ rather\ than\ adding\ a\ second\ one/);
  });

  it('labels the button "Submit", never "Publish" or "Post"', async () => {
    await renderReply('fixture-review-0002');
    const submit = screen.getByTestId('review-reply-submit');
    expect(submit).toHaveTextContent(/Submit\ to\ Google/);
    expect(submit).not.toHaveTextContent(/Publish|Post/);
  });

  it('disables submit with a visible reason while the box is empty', async () => {
    await renderReply('fixture-review-0002');
    expect(screen.getByTestId('review-reply-submit')).toBeDisabled();
    expect(screen.getByTestId('review-reply-blocked-reason')).toHaveTextContent(/Write\ something\ first/);
  });

  it('gives length guidance without enforcing a limit Google has not documented', async () => {
    await renderReply('fixture-review-0002');
    await fireEvent.changeText(screen.getByTestId('review-reply-composer-input'), 'x'.repeat(400));
    expect(screen.getByText(/400 characters/)).toBeOnTheScreen();
    expect(screen.getByText(/no limit is enforced here/)).toBeOnTheScreen();
    // The text is not truncated — the owner's words survive.
    expect(screen.getByTestId('review-reply-composer-input').props.value).toHaveLength(400);
  });

  it('reports the adapter’s answer on submit, and never calls it published', async () => {
    await renderReply('fixture-review-0002');
    await fireEvent.changeText(
      screen.getByTestId('review-reply-composer-input'),
      'Thank you for telling us.',
    );
    await fireEvent.press(screen.getByTestId('review-reply-submit'));

    // The real adapter runs. With no transport and no session it reports
    // not_connected — which is the truth, and is what the owner is shown.
    await waitFor(() => {
      expect(screen.getByTestId('review-reply-outcome-state')).toBeOnTheScreen();
    });
    expect(screen.queryByText(/Live on Google/)).toBeNull();
    expect(screen.queryByText(/^Published$/)).toBeNull();
  });

  it('refuses the AI draft out loud rather than spinning forever', async () => {
    await renderReply('fixture-review-0002');

    const button = screen.getByTestId('review-reply-draft-button');
    expect(button).toBeDisabled();
    expect(screen.getByTestId('review-reply-draft-refusal')).toBeOnTheScreen();
    // Nothing is in flight, so nothing can hang.
    expect(screen.queryByTestId('review-reply-draft-state')).toBeNull();
  });

  it('disables the tone chips with the same reason when the model is refused', async () => {
    await renderReply('fixture-review-0002');
    expect(screen.getByTestId('review-reply-draft-tone-warm')).toBeDisabled();
  });

  it('will not draft from a review with no text', async () => {
    await renderReply('fixture-review-0004');
    expect(screen.getByTestId('review-reply-draft-button')).toBeDisabled();
    expect(screen.getByTestId('review-reply-draft-refusal')).toBeOnTheScreen();
  });
});

/* -------------------------------------------------------------------------- */
/* 7. The arithmetic                                                          */
/* -------------------------------------------------------------------------- */

describe('summariseReviews', () => {
  it('marks a page complete only when nothing is missing from it', () => {
    const page = buildFixtureReviewPage();
    expect(summariseReviews(page).distributionComplete).toBe(false);

    const complete: GbpReviewPage = {
      ...page,
      skipped: [],
      nextPageToken: null,
      totalReviewCount: page.reviews.length,
    };
    expect(summariseReviews(complete).distributionComplete).toBe(true);
  });

  it('treats a further page as making the picture incomplete', () => {
    const page = buildFixtureReviewPage();
    const paged: GbpReviewPage = {
      ...page,
      skipped: [],
      nextPageToken: 'more',
      totalReviewCount: page.reviews.length,
    };
    expect(summariseReviews(paged).distributionComplete).toBe(false);
  });
});

describe('formatReviewDate', () => {
  it('returns null rather than inventing a date it cannot read', () => {
    expect(formatReviewDate(null)).toBeNull();
    expect(formatReviewDate('')).toBeNull();
    expect(formatReviewDate('not-a-date')).toBeNull();
  });

  it('formats a real timestamp for a human', () => {
    expect(formatReviewDate('2020-01-01T00:00:00.000Z')).toBe('1 January 2020');
  });
});

describe('the fixture scenarios', () => {
  it('cover every state this screen has to render', () => {
    expect(buildReviewsScenarios().map((scenario) => scenario.id)).toEqual([
      'loaded',
      'no_reviews',
      'no_summary',
      'verify',
      'wait',
      'ownership_conflict',
      'suspended',
      'rate_limited',
    ]);
  });

  it('never produces a published reply from wire data, because the enum is unverified', () => {
    // `REVIEW_REPLY_STATE_MEANINGS` is empty on purpose. Until someone fills it
    // in from the first-party reference, no wire response can make Shoogle say
    // a reply is live. This test fails the day that stops being true, which is
    // exactly when the copy needs re-reading.
    const fromWire: GbpReviewDetail[] = buildFixtureReviewPage().reviews.filter((review) =>
      review.reviewId.startsWith('fixture-review-000'),
    );
    const wireOnly = fromWire.filter(
      (review) => !['fixture-review-0006', 'fixture-review-0007'].includes(review.reviewId),
    );
    expect(wireOnly.some((review) => isPublishedOnGoogle(review.replyModeration))).toBe(false);
  });
});
