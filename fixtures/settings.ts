/**
 * DEVELOPMENT FIXTURES — NOT CUSTOMER DATA.
 *
 * Content transcribed from the `settings` screen in "Shoogle Website.dc.html".
 * Every value is invented. Read fixtures/README.md before using it.
 */

export interface SettingsFixture {
  account: { businessName: string; initials: string; ownerLine: string };
  connectedIssues: number;
  employees: number;
  labels: number;
  plan: string;
}

export const settingsFixture: SettingsFixture = {
  account: {
    businessName: 'Vahan Ready',
    initials: 'VR',
    ownerLine: 'Ravi Deshmukh · Owner',
  },
  connectedIssues: 1,
  employees: 3,
  labels: 5,
  plan: 'Growth',
};
