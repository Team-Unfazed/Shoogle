/**
 * The deterministic AI-search analyses: robots parsing, the visibility check,
 * schema generation and readability observations.
 *
 * The rule under test throughout: a check that could not run is reported as
 * unchecked. It is never scored as a pass (which would fabricate health) and
 * never as a fail (which would fabricate a problem).
 */

import type { PageSnapshot } from '../ai/html';
import { aiCrawlerAccess, crawlerAccess, parseRobotsTxt } from '../ai/robots';
import { checkAiVisibility, fetchPageSnapshot, type MinimalResponse } from '../ai/visibility';
import {
  SCHEMA_TYPE_BY_CATEGORY,
  buildLocalBusinessSchema,
  inspectJsonLd,
  isIndianE164,
  serializeLocalBusinessSchema,
  type LocalBusinessSchemaInput,
} from '../ai/schema';
import { directoryChecklist, directoryCoverage } from '../ai/directories';
import { observeReadability } from '../ai/readability';

const snapshot = (overrides: Partial<PageSnapshot> = {}): PageSnapshot => ({
  requestedUrl: 'https://fixture.example/',
  finalUrl: 'https://fixture.example/',
  httpStatus: 200,
  headers: {},
  html: '<html><head><title>t</title></head><body><h1>H</h1><p>Some readable copy here for the check.</p><a href="tel:+919000000000">call</a></body></html>',
  robotsTxt: 'User-agent: *\nAllow: /\n',
  fetchedAt: '2020-01-01T00:00:00.000Z',
  ...overrides,
});

describe('robots.txt', () => {
  it('honours a group aimed at one agent', () => {
    const file = parseRobotsTxt('User-agent: *\nAllow: /\n\nUser-agent: OAI-SearchBot\nDisallow: /\n');
    expect(crawlerAccess(file, 'OAI-SearchBot', '/')).toBe('disallowed');
    expect(crawlerAccess(file, 'PerplexityBot', '/')).toBe('allowed');
  });

  it('treats an empty Disallow as permission', () => {
    const file = parseRobotsTxt('User-agent: *\nDisallow:\n');
    expect(crawlerAccess(file, 'Googlebot', '/')).toBe('allowed');
  });

  it('lets a longer Allow beat a shorter Disallow', () => {
    const file = parseRobotsTxt('User-agent: *\nDisallow: /\nAllow: /services\n');
    expect(crawlerAccess(file, 'Googlebot', '/services/hair')).toBe('allowed');
    expect(crawlerAccess(file, 'Googlebot', '/pricing')).toBe('disallowed');
  });

  it('reports unknown, not allowed, when robots.txt could not be read', () => {
    const access = aiCrawlerAccess(null);
    expect(access['OAI-SearchBot']).toBe('unknown');
    expect(access['Googlebot']).toBe('unknown');
  });
});

describe('checkAiVisibility', () => {
  it('produces no score, only findings and counts', () => {
    const report = checkAiVisibility(snapshot());
    expect(report).not.toHaveProperty('score');
    expect(report.checksRun).toBeGreaterThan(0);
    expect(report.checksPassed).toBeLessThanOrEqual(report.checksRun);
  });

  it('always names what it cannot check', () => {
    const report = checkAiVisibility(snapshot());
    expect(report.uncheckedAreas.length).toBeGreaterThan(0);
    expect(report.uncheckedAreas.join(' ')).toMatch(/rank/i);
  });

  it('flags blocked AI search crawlers as critical', () => {
    const report = checkAiVisibility(
      snapshot({ robotsTxt: 'User-agent: Claude-SearchBot\nDisallow: /\n' }),
    );
    const finding = report.findings.find((entry) => entry.checkId === 'ai.robots.search_crawlers');
    expect(finding?.severity).toBe('critical');
    expect(finding?.observation).toContain('Claude-SearchBot');
  });

  it('does not treat a blocked training crawler as a finding', () => {
    const report = checkAiVisibility(snapshot({ robotsTxt: 'User-agent: GPTBot\nDisallow: /\n' }));
    expect(report.findings.some((entry) => entry.checkId === 'ai.robots.search_crawlers')).toBe(false);
  });

  it('reports crawler access as unchecked when robots.txt is missing', () => {
    const report = checkAiVisibility(snapshot({ robotsTxt: null }));
    expect(report.findings.some((entry) => entry.checkId === 'ai.robots.search_crawlers')).toBe(false);
    expect(report.uncheckedAreas.join(' ')).toMatch(/robots\.txt/);
  });

  it('flags noindex and nosnippet', () => {
    const report = checkAiVisibility(
      snapshot({
        html: '<html><head><meta name="robots" content="noindex, nosnippet"></head><body><p>x</p></body></html>',
      }),
    );
    const ids = report.findings.map((entry) => entry.checkId);
    expect(ids).toContain('ai.page.indexable');
    expect(ids).toContain('ai.page.snippet_eligible');
  });

  it('reads nosnippet from the X-Robots-Tag header too', () => {
    const report = checkAiVisibility(snapshot({ headers: { 'X-Robots-Tag': 'nosnippet' } }));
    expect(report.findings.some((entry) => entry.checkId === 'ai.page.snippet_eligible')).toBe(true);
  });

  it('stops after a failed fetch instead of guessing about the page', () => {
    const report = checkAiVisibility(snapshot({ httpStatus: 503 }));
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.checkId).toBe('ai.page.reachable');
    expect(report.uncheckedAreas.join(' ')).toMatch(/did not load/);
  });

  it('flags an empty app shell as a JavaScript-only page, labelled as a study', () => {
    const report = checkAiVisibility(
      snapshot({ html: '<html><body><div id="root"></div><script>var a=1;</script></body></html>' }),
    );
    const finding = report.findings.find((entry) => entry.checkId === 'ai.page.no_js_content');
    expect(finding?.evidenceBasis).toBe('study');
  });

  it('flags a missing phone number, and passes when a tel: link exists', () => {
    const withoutPhone = checkAiVisibility(
      snapshot({ html: '<html><body><p>No number anywhere on this page at all.</p></body></html>' }),
    );
    expect(withoutPhone.findings.some((entry) => entry.checkId === 'ai.page.phone_present')).toBe(true);
    const withPhone = checkAiVisibility(snapshot());
    expect(withPhone.findings.some((entry) => entry.checkId === 'ai.page.phone_present')).toBe(false);
  });

  it('treats a missing Last-Modified header as unchecked, not as stale', () => {
    const report = checkAiVisibility(snapshot());
    expect(report.findings.some((entry) => entry.checkId === 'ai.page.freshness')).toBe(false);
    expect(report.uncheckedAreas.join(' ')).toMatch(/last changed/i);
  });
});

describe('fetchPageSnapshot', () => {
  const response = (status: number, body: string): MinimalResponse => ({
    status,
    url: 'https://fixture.example/',
    headers: { forEach: () => undefined },
    text: async () => body,
  });

  it('records robots.txt as null when it could not be read', async () => {
    const fetchImpl = jest.fn(async (url: string) =>
      url.endsWith('robots.txt') ? response(404, '') : response(200, '<html></html>'),
    );
    const state = await fetchPageSnapshot('https://fixture.example/', fetchImpl, () => 'now');
    expect(state.status).toBe('ready');
    if (state.status === 'ready') expect(state.value.robotsTxt).toBeNull();
  });

  it('reports offline rather than an empty page when the fetch throws', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('network');
    });
    const state = await fetchPageSnapshot('https://fixture.example/', fetchImpl);
    expect(state.status).toBe('unavailable');
    if (state.status === 'unavailable') expect(state.reason).toBe('offline');
  });

  it('rejects something that is not a web address', async () => {
    const state = await fetchPageSnapshot('salon.example', jest.fn());
    expect(state.status).toBe('unavailable');
  });
});

describe('LocalBusiness schema generation', () => {
  const base: LocalBusinessSchemaInput = {
    name: '[FIXTURE] Example Salon',
    category: 'salon',
    typeOverride: null,
    url: 'https://fixture.example/',
    streetAddress: '[FIXTURE] 1 Example Road',
    addressLocality: '[FIXTURE] Example Locality',
    addressRegion: 'Maharashtra',
    postalCode: '400706',
    telephone: '+919000000000',
    geo: { latitude: 19.03301, longitude: 73.01991 },
    priceRange: '₹300–₹1500',
    openingHours: [{ days: ['Monday'], opens: '10:00', closes: '20:00' }],
    imageUrls: ['https://fixture.example/photo.jpg'],
    areaServed: [],
    servesCuisine: [],
    description: null,
  };

  it('uses the most specific subtype for each Indian vertical', () => {
    expect(SCHEMA_TYPE_BY_CATEGORY.salon).toBe('HairSalon');
    expect(SCHEMA_TYPE_BY_CATEGORY.gym).toBe('HealthClub');
    expect(SCHEMA_TYPE_BY_CATEGORY.clinic).toBe('MedicalClinic');
    expect(SCHEMA_TYPE_BY_CATEGORY.bakery).toBe('Bakery');
    expect(SCHEMA_TYPE_BY_CATEGORY.boutique).toBe('ClothingStore');
    expect(SCHEMA_TYPE_BY_CATEGORY.repair_shop).toBe('AutoRepair');
    expect(SCHEMA_TYPE_BY_CATEGORY.other).toBe('LocalBusiness');
  });

  it('emits India defaults and never a self-served rating', () => {
    const result = buildLocalBusinessSchema(base);
    const address = result.jsonLd['address'] as Record<string, unknown>;
    expect(address['addressCountry']).toBe('IN');
    expect(result.jsonLd['currenciesAccepted']).toBe('INR');
    expect(result.jsonLd).not.toHaveProperty('aggregateRating');
    expect(result.jsonLd).not.toHaveProperty('review');
    expect(result.publishable).toBe(true);
  });

  it('omits a property it does not have rather than emitting an empty value', () => {
    const result = buildLocalBusinessSchema({ ...base, telephone: null, geo: null, url: null });
    expect(result.jsonLd).not.toHaveProperty('telephone');
    expect(result.jsonLd).not.toHaveProperty('geo');
    expect(result.jsonLd).not.toHaveProperty('url');
    expect(result.missingRecommended).toEqual(expect.arrayContaining(['telephone', 'geo', 'url']));
  });

  it('drops a phone number that is not in E.164 and says why', () => {
    const result = buildLocalBusinessSchema({ ...base, telephone: '022 2766 1234' });
    expect(result.jsonLd).not.toHaveProperty('telephone');
    expect(result.notes.join(' ')).toMatch(/\+91/);
    expect(isIndianE164('+919000000000')).toBe(true);
    expect(isIndianE164('9000000000')).toBe(false);
  });

  it('drops imprecise coordinates rather than pointing at the neighbourhood', () => {
    const result = buildLocalBusinessSchema({ ...base, geo: { latitude: 19.03, longitude: 73.01 } });
    expect(result.jsonLd).not.toHaveProperty('geo');
  });

  it('does not count a missing street address against a service-area business', () => {
    const result = buildLocalBusinessSchema({
      ...base,
      streetAddress: null,
      areaServed: ['[FIXTURE] Example Locality'],
    });
    expect(result.missingRequired).not.toContain('address.streetAddress');
    expect(result.jsonLd['areaServed']).toEqual(['[FIXTURE] Example Locality']);
  });

  it('refuses to serialise incomplete markup', () => {
    const result = buildLocalBusinessSchema({ ...base, addressLocality: null });
    expect(result.publishable).toBe(false);
    expect(serializeLocalBusinessSchema(result)).toBeNull();
  });

  it('escapes < so a value cannot break out of the script block', () => {
    const result = buildLocalBusinessSchema({ ...base, name: 'A </script> B' });
    const markup = serializeLocalBusinessSchema(result);
    expect(markup).not.toBeNull();
    expect(markup ?? '').not.toContain('</script> B');
  });
});

describe('inspectJsonLd', () => {
  it('reports absent rather than invalid when there is no markup', () => {
    const inspection = inspectJsonLd([]);
    expect(inspection.verdict).toBe('absent');
    expect(inspection.unchecked.length).toBeGreaterThan(0);
  });

  it('reports unparseable markup instead of throwing', () => {
    expect(inspectJsonLd(['{not json']).verdict).toBe('unparseable');
  });

  it('finds a LocalBusiness inside an @graph and names the failed checks', () => {
    const inspection = inspectJsonLd([
      JSON.stringify({
        '@graph': [{ '@type': 'WebSite' }, { '@type': 'HairSalon', name: 'X', address: { '@type': 'PostalAddress', addressLocality: 'Nerul' } }],
      }),
    ]);
    expect(inspection.verdict).toBe('present');
    expect(inspection.type).toBe('HairSalon');
    expect(inspection.isSpecificSubtype).toBe(true);
    expect(inspection.passed).toContain('name');
    expect(inspection.failed).toContain('address.streetAddress');
  });

  it('never claims markup is valid', () => {
    const inspection = inspectJsonLd([JSON.stringify({ '@type': 'HairSalon', name: 'X' })]);
    expect(Object.keys(inspection)).not.toContain('valid');
    expect(inspection.unchecked.join(' ')).toMatch(/Rich Results Test/);
  });
});

describe('directory checklist', () => {
  it('starts every row unanswered rather than not listed', () => {
    const rows = directoryChecklist('salon', {});
    expect(rows.every((row) => row.presence === 'unknown')).toBe(true);
    const coverage = directoryCoverage(rows);
    expect(coverage.notListed).toBe(0);
    expect(coverage.unanswered).toBe(rows.length);
  });

  it('offers only the directories relevant to a vertical', () => {
    const clinicIds = directoryChecklist('clinic', {}).map((row) => row.entry.id);
    expect(clinicIds).toContain('practo');
    expect(clinicIds).not.toContain('zomato');
  });

  it('carries the evidence and the date behind every row', () => {
    for (const row of directoryChecklist('restaurant', {})) {
      expect(row.entry.evidenceNote.length).toBeGreaterThan(0);
      expect(row.entry.observedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('reports counts, never a coverage percentage', () => {
    const rows = directoryChecklist('salon', { google_business_profile: 'listed', justdial: 'not_listed' });
    const coverage = directoryCoverage(rows);
    expect(coverage.listed).toBe(1);
    expect(coverage.notListed).toBe(1);
    expect(coverage).not.toHaveProperty('percent');
  });
});

describe('readability observations', () => {
  it('returns observations with a cited reason and no score', () => {
    const result = observeReadability({
      pageLabel: 'Services',
      html: `<html><body><h1>Services</h1><p>${'word '.repeat(500)}</p></body></html>`,
    });
    expect(result).not.toHaveProperty('score');
    const passage = result.observations.find((entry) => entry.id === 'readability.passage.long');
    expect(passage?.evidenceBasis).toBe('study');
    expect(passage?.reason).toMatch(/SE Ranking/);
  });

  it('notes a missing H1 and a skipped heading level', () => {
    const result = observeReadability({
      pageLabel: 'Home',
      html: '<html><body><h2>A</h2><h4>B</h4><p>Some copy that is long enough to read here.</p></body></html>',
    });
    const ids = result.observations.map((entry) => entry.id);
    expect(ids).toContain('readability.h1.missing');
    expect(ids).toContain('readability.headings.hierarchy');
  });

  it('reports nothing observed when the page has no readable text', () => {
    const result = observeReadability({ pageLabel: 'Home', html: '<html><body></body></html>' });
    expect(result.observations).toHaveLength(0);
    expect(result.notObserved.length).toBeGreaterThan(0);
    expect(result.longestPassageWords).toBeNull();
  });
});
