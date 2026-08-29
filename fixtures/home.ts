/**
 * DEVELOPMENT FIXTURES — NOT CUSTOMER DATA.
 *
 * This is the demo business from the Claude Design project ("Vahan Ready", a
 * driving-lessons consultancy in Nerul). It exists so the Home screen can be
 * built and reviewed against the wireframe before any integration exists.
 *
 * Every number here is invented. Read fixtures/README.md before using it.
 * Access goes through `getFixtures()` / `fixtureState()`, which are gated to
 * development builds — see fixtures/index.ts.
 *
 * Copy is Hinglish where it represents GENERATED BUSINESS CONTENT, which
 * product rule 12 permits. The surrounding UI chrome stays English.
 */

import type { AccentName } from '@/theme/tokens';

export interface HomeSuggestion {
  id: string;
  /** Uppercase label, e.g. "SOCIAL POST". */
  kind: string;
  accent: AccentName;
  title: string;
  body: string;
  primaryLabel: string;
  /** How long the owner needs to spend, e.g. "2 min". */
  effort: string;
}

export interface HomeInsight {
  id: string;
  label: string;
  accent: AccentName;
  text: string;
}

export interface HomeMetric {
  key: string;
  label: string;
  value: number;
  changePct: number | null;
}

export interface HomeModule {
  id: string;
  title: string;
  subtitle: string;
  accent: AccentName;
  icon: 'social' | 'seo' | 'website';
  href: string;
  /** Renders the subtitle in the accent colour, for items needing attention. */
  emphasis?: boolean;
}

export interface HomeAlert {
  id: string;
  title: string;
  body: string;
  actionLabel: string;
  href: string;
}

export interface HomeFixture {
  business: { name: string; locality: string; initials: string };
  unreadNotifications: number;
  headline: HomeSuggestion;
  moreSuggestions: number;
  insights: HomeInsight[];
  metricsPeriod: string;
  metrics: HomeMetric[];
  alert: HomeAlert | null;
  modules: HomeModule[];
}

export const homeFixture: HomeFixture = {
  business: { name: 'Vahan Ready', locality: 'Nerul, Navi Mumbai', initials: 'VR' },
  unreadNotifications: 3,

  headline: {
    id: 'fixture-suggestion-headline',
    kind: 'SOCIAL POST',
    accent: 'blue',
    title: 'Monday morning post ready',
    body: '"Licence renewal ke liye 3 documents chahiye — bas itna." Aapke last week ke best post jaisa hai.',
    primaryLabel: 'Review & schedule',
    effort: '2 min',
  },
  moreSuggestions: 3,

  insights: [
    {
      id: 'fixture-insight-reach',
      label: '↑ REACH',
      accent: 'green',
      text: 'Instagram reach 18% badha is hafte.',
    },
    {
      id: 'fixture-insight-review',
      label: '★ NEW REVIEW',
      accent: 'blue',
      text: 'Priya S. ne 5 star diya. Reply pending.',
    },
    {
      id: 'fixture-insight-website',
      label: '◱ WEBSITE',
      accent: 'amber',
      text: 'Aapki website review ke liye ready hai.',
    },
  ],

  metricsPeriod: 'Last 28 days',
  metrics: [
    { key: 'google_views', label: 'Google views', value: 1204, changePct: 12 },
    { key: 'ig_reach', label: 'IG reach', value: 2412, changePct: 18 },
    // A genuine zero change, which is different from an unknown one.
    { key: 'calls', label: 'Calls', value: 38, changePct: 0 },
  ],

  alert: {
    id: 'fixture-alert-instagram',
    title: 'Instagram ko dobara permission chahiye',
    body: 'Tab tak posts publish nahi honge',
    actionLabel: 'Fix',
    href: '/(tabs)/business',
  },

  modules: [
    {
      id: 'social',
      title: 'Social',
      subtitle: '3 posts scheduled · 1 draft pending',
      accent: 'blue',
      icon: 'social',
      href: '/(tabs)/posts',
    },
    {
      id: 'seo',
      title: 'SEO / Local',
      subtitle: '4 keywords improved · 1 review unanswered',
      accent: 'green',
      icon: 'seo',
      href: '/(tabs)/business',
    },
    {
      id: 'website',
      title: 'Website',
      subtitle: 'Ready for your review',
      accent: 'amber',
      icon: 'website',
      href: '/(tabs)/business',
      emphasis: true,
    },
  ],
};
