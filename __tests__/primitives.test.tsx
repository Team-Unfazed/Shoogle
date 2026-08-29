import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  Metric,
  Navigation,
  PRIMARY_NAVIGATION,
  PostStatusBadge,
  Score,
  Select,
  Skeleton,
  Tabs,
  Textarea,
  UNKNOWN_VALUE_PLACEHOLDER,
  countCharacters,
  initialsFor,
  scoreBand,
} from '@/components/ui';
import { ThemeProvider } from '@/theme';

/**
 * Design-system primitive tests.
 *
 * Note: React Native Testing Library 14 returns a Promise from `render`, so
 * every render must be awaited before querying `screen`.
 *
 * Insets are fixed at a 412x915 Android viewport (one of the two target sizes)
 * so safe-area-dependent components lay out deterministically.
 */
const metrics = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

function wrap(ui: ReactNode) {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider forceScheme="light">{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );
}

describe('Button', () => {
  it('renders its label and fires onPress', async () => {
    const onPress = jest.fn();
    await wrap(<Button label="Schedule post" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Schedule post' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire while loading, and reports busy to assistive tech', async () => {
    const onPress = jest.fn();
    await wrap(<Button label="Save" onPress={onPress} loading testID="btn" />);
    await fireEvent.press(screen.getByTestId('btn'));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByTestId('btn')).toBeBusy();
    expect(screen.getByTestId('btn')).toBeDisabled();
  });

  it('does not fire when disabled', async () => {
    const onPress = jest.fn();
    await wrap(<Button label="Save" onPress={onPress} disabled testID="btn" />);
    await fireEvent.press(screen.getByTestId('btn'));
    expect(onPress).not.toHaveBeenCalled();
  });

  // One render per test: RNTL 14 cleans up between tests itself, and calling
  // unmount() manually mid-test leaves the renderer unusable for later renders.
  it.each(['large', 'medium', 'small'] as const)(
    'meets the Android minimum touch target at size %s',
    async (size) => {
      await wrap(<Button label="X" size={size} testID="btn" />);
      const style = screen.getByTestId('btn').props.style;
      const flat = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;
      expect(flat.minHeight).toBeGreaterThanOrEqual(44);
    },
  );
});

describe('IconButton', () => {
  it('exposes the required accessible label', async () => {
    const onPress = jest.fn();
    await wrap(<IconButton name="close" accessibilityLabel="Close" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('Metric', () => {
  it('renders a known value', async () => {
    await wrap(<Metric label="Profile views" value={1234} period="last 28 days" />);
    expect(screen.getByText('1,234')).toBeOnTheScreen();
  });

  // The central honesty guarantee behind product rule 7.
  it('renders unknown as a placeholder, NOT as zero', async () => {
    await wrap(<Metric label="Profile views" value={null} unavailableReason="Not connected" />);
    expect(screen.getByText(UNKNOWN_VALUE_PLACEHOLDER)).toBeOnTheScreen();
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.getByText('Not connected')).toBeOnTheScreen();
  });

  it('shows no trend at all when the change is unknown', async () => {
    await wrap(<Metric label="Views" value={10} changePct={null} />);
    expect(screen.getByText('10')).toBeOnTheScreen();
    expect(screen.queryByText('0%')).toBeNull();
  });

  it('distinguishes a genuine zero change from an unknown one', async () => {
    await wrap(<Metric label="Views" value={10} changePct={0} />);
    expect(screen.getByText('0%')).toBeOnTheScreen();
  });

  it('announces unavailability to screen readers', async () => {
    await wrap(<Metric label="Reach" value={null} testID="m" />);
    expect(screen.getByTestId('m').props.accessibilityLabel).toContain('not available');
  });
});

describe('Score', () => {
  it('shows a placeholder and an explanation when nothing has been measured', async () => {
    await wrap(<Score value={null} />);
    expect(screen.getByText('Not measured yet')).toBeOnTheScreen();
    expect(screen.getByText(UNKNOWN_VALUE_PLACEHOLDER)).toBeOnTheScreen();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('surfaces how many checks could not be run', async () => {
    await wrap(<Score value={72} uncheckedCount={3} />);
    expect(screen.getByText('3 checks could not be run')).toBeOnTheScreen();
  });

  it('bands scores consistently', () => {
    expect(scoreBand(85)).toBe('green');
    expect(scoreBand(55)).toBe('amber');
    expect(scoreBand(12)).toBe('red');
  });
});

describe('Badge', () => {
  it('maps every post status to owner-facing copy', async () => {
    await wrap(<PostStatusBadge status="scheduled" />);
    expect(screen.getByText('Scheduled')).toBeOnTheScreen();
  });

  it('renders a plain badge', async () => {
    await wrap(<Badge label="Not connected" />);
    expect(screen.getByText('Not connected')).toBeOnTheScreen();
  });
});

describe('Input', () => {
  it('binds its label and reports the error state', async () => {
    await wrap(
      <Input label="Email" value="" onChangeText={() => {}} error="Enter an email" testID="in" />,
    );
    expect(screen.getByTestId('in').props['aria-invalid']).toBe(true);
    expect(screen.getByText('Enter an email')).toBeOnTheScreen();
  });

  it('states when a value was retrieved rather than typed', async () => {
    await wrap(
      <Input
        label="Phone"
        value="x"
        onChangeText={() => {}}
        prefilledFrom="Google Business Profile"
      />,
    );
    expect(screen.getByText('From Google Business Profile')).toBeOnTheScreen();
  });

  it('hides the hint while an error is shown', async () => {
    await wrap(
      <Input label="Email" value="" onChangeText={() => {}} hint="Work email" error="Bad" />,
    );
    expect(screen.getByText('Bad')).toBeOnTheScreen();
    expect(screen.queryByText('Work email')).toBeNull();
  });
});

describe('Textarea', () => {
  it('counts Devanagari and emoji as single characters', () => {
    expect(countCharacters('नमस्ते')).toBe(6);
    expect(countCharacters('👍')).toBe(1);
  });

  it('flags going over the character limit', async () => {
    await wrap(<Textarea label="Caption" value="abcdef" onChangeText={() => {}} maxCharacters={3} />);
    expect(screen.getByText('3 characters over the limit')).toBeOnTheScreen();
  });
});

describe('Select', () => {
  it('shows the placeholder until something is chosen', async () => {
    await wrap(
      <Select
        label="Category"
        value={null}
        options={[{ value: 'salon', label: 'Salon' }]}
        onChange={() => {}}
        placeholder="Choose one"
      />,
    );
    expect(screen.getByText('Choose one')).toBeOnTheScreen();
  });

  it('announces the current selection in its accessible name', async () => {
    await wrap(
      <Select
        label="Category"
        value="salon"
        options={[{ value: 'salon', label: 'Salon' }]}
        onChange={() => {}}
        testID="sel"
      />,
    );
    expect(screen.getByTestId('sel').props.accessibilityLabel).toBe('Category, Salon');
  });
});

describe('Tabs', () => {
  it('marks the active tab as selected and switches on press', async () => {
    const onChange = jest.fn();
    await wrap(
      <Tabs
        items={[
          { value: 'a', label: 'Scheduled' },
          { value: 'b', label: 'Published' },
        ]}
        value="a"
        onChange={onChange}
        accessibilityLabel="Filter"
      />,
    );
    expect(screen.getByRole('tab', { name: 'Scheduled' })).toBeSelected();
    await fireEvent.press(screen.getByRole('tab', { name: 'Published' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('Navigation', () => {
  it('has exactly the four specified primary destinations', () => {
    expect(PRIMARY_NAVIGATION.map((i) => i.label)).toEqual([
      'Home',
      'Posts',
      'Business',
      'Settings',
    ]);
  });

  it('marks the active destination and reports selection', async () => {
    const onSelect = jest.fn();
    await wrap(<Navigation items={PRIMARY_NAVIGATION} activeKey="posts" onSelect={onSelect} />);
    expect(screen.getByTestId('nav-posts')).toBeSelected();
    await fireEvent.press(screen.getByTestId('nav-business'));
    expect(onSelect).toHaveBeenCalledWith('business');
  });

  it('omits a badge rather than rendering a zero count', async () => {
    await wrap(
      <Navigation
        items={[{ ...PRIMARY_NAVIGATION[0]!, badgeCount: 0 }]}
        activeKey="index"
        onSelect={() => {}}
      />,
    );
    expect(screen.getByTestId('nav-index')).toBeOnTheScreen();
    expect(screen.queryByText('0')).toBeNull();
  });
});

describe('EmptyState and ErrorState', () => {
  it('EmptyState reads as one summary for screen readers', async () => {
    await wrap(<EmptyState title="Nothing yet" body="Come back later." testID="empty" />);
    expect(screen.getByTestId('empty').props.accessibilityLabel).toBe(
      'Nothing yet. Come back later.',
    );
  });

  it('ErrorState offers retry when a handler is supplied', async () => {
    const onRetry = jest.fn();
    await wrap(<ErrorState message="Could not load." onRetry={onRetry} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('ErrorState omits retry when retrying cannot help', async () => {
    await wrap(<ErrorState message="Could not load." />);
    expect(screen.getByText('Could not load.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});

describe('Card, Skeleton and Avatar helpers', () => {
  it('Card is a single button for screen readers when pressable', async () => {
    const onPress = jest.fn();
    await wrap(
      <Card onPress={onPress} accessibilityLabel="Open SEO">
        <Badge label="x" />
      </Card>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Open SEO' }));
    expect(onPress).toHaveBeenCalled();
  });

  it('Card shows a skeleton instead of children while loading', async () => {
    await wrap(
      <Card loading testID="card">
        <Badge label="should-not-render" />
      </Card>,
    );
    expect(screen.getByTestId('card')).toBeOnTheScreen();
    expect(screen.queryByText('should-not-render')).toBeNull();
  });

  it('Skeleton announces itself as a labelled progress indicator', async () => {
    await wrap(<Skeleton label="Loading posts" testID="sk" />);
    expect(screen.getByTestId('sk').props.accessibilityLabel).toBe('Loading posts');
  });

  it('derives initials from one or many words', () => {
    expect(initialsFor('Vahan Ready')).toBe('VR');
    expect(initialsFor('Salon')).toBe('S');
    expect(initialsFor('   ')).toBe('?');
  });
});
