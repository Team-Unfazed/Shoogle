import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * The two blocks of copy that ship WITH the feature rather than in a help
 * centre nobody opens.
 *
 * WHY THE RULES ARE NOT OPTIONAL READING
 * --------------------------------------
 * Every step in this loop is a step where an owner can get their listing
 * penalised. Offering a free head massage for a five-star review, asking only
 * the customers who looked happy, sitting a tablet on the counter and having
 * forty people review from the same device — all of these are things a
 * well-meaning shop owner does because they seem generous, and all of them are
 * against Google's review policies. The consequence lands on the listing, which
 * for a neighbourhood business is most of its new customers.
 *
 * A tool that hands someone a bulk-request machine and puts the warnings behind
 * a link has chosen its own conversion over their business. So the guidance
 * renders on the same screen as the button, above the fold of the send flow's
 * consequences, and it is written as instructions rather than legalese.
 */
export function HowThisWorksCard({ testID }: { testID?: string }) {
  const theme = useTheme();

  const steps: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }[] = [
    {
      icon: 'link-outline',
      text: 'Shoogle needs your Google review link. Once your profile is connected it builds the link itself; until then you paste the one Google already gives you.',
    },
    {
      icon: 'qr-code-outline',
      text: 'The QR is that same link. Print it for the counter, or send the link on WhatsApp right after someone’s visit.',
    },
    {
      icon: 'checkmark-done-outline',
      text: 'You confirm each request actually went out, and Shoogle counts those. It never guesses, and it never claims a review came from a request.',
    },
  ];

  return (
    <Card testID={testID}>
      <Text variant="cardTitle">How this works</Text>
      {steps.map((step, index) => (
        <View key={step.icon} style={[styles.step, { marginTop: theme.spacing.md }]}>
          <View
            style={[
              styles.stepIcon,
              {
                backgroundColor: theme.colors.greenSoft,
                borderRadius: theme.radii.sm,
              },
            ]}>
            <Ionicons name={step.icon} size={17} color={theme.colors.green} />
          </View>
          <Text
            variant="body"
            tone="muted"
            style={{ flex: 1, marginLeft: theme.spacing.md }}
            accessibilityLabel={`Step ${index + 1}. ${step.text}`}>
            {step.text}
          </Text>
        </View>
      ))}
    </Card>
  );
}

/** Each rule is a thing not to do, and what happens if you do it. */
const RULES: { title: string; body: string }[] = [
  {
    title: 'Never offer anything in return',
    body: 'No discount, no free service, no lucky draw, no cash. Google treats paid or incentivised reviews as prohibited content and removes them — and repeat offences put the listing itself at risk.',
  },
  {
    title: 'Ask everyone, not only the happy ones',
    body: 'Filtering customers so that only satisfied ones are asked — review gating — is against Google’s policy. Ask each customer the same way, whatever you think they will say.',
  },
  {
    title: 'Do not request in bulk',
    body: 'Blasting a contact list, or setting up a review station where many people review from the same device or network, looks exactly like fake-review behaviour to Google’s systems. Ask one person at a time.',
  },
  {
    title: 'Never write or buy them',
    body: 'Reviews from staff, family or a paid service are the fastest route to a suspended profile, and a suspension takes weeks to appeal.',
  },
];

export function GoogleRulesCard({ testID }: { testID?: string }) {
  const theme = useTheme();

  return (
    <Card testID={testID} accent="red">
      <View style={styles.headerRow}>
        <Ionicons name="shield-checkmark-outline" size={18} color={theme.colors.red} />
        <Text variant="cardTitle" style={{ marginLeft: theme.spacing.sm }}>
          Google’s rules on asking
        </Text>
      </View>

      <Text variant="caption" tone="muted" style={{ marginTop: 6 }}>
        Breaking these can get reviews stripped or the whole profile suspended, which costs far
        more than the reviews were worth.
      </Text>

      {RULES.map((rule) => (
        <View key={rule.title} style={{ marginTop: theme.spacing.lg }}>
          <Text variant="bodyStrong">{rule.title}</Text>
          <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
            {rule.body}
          </Text>
        </View>
      ))}

      <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.lg }}>
        Summarised from Google’s prohibited and restricted content policy for reviews. Google can
        change it; this card is Shoogle’s reading of it, not a legal guarantee.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  step: { flexDirection: 'row', alignItems: 'flex-start' },
  stepIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
});
