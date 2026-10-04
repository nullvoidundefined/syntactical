import { renderRouter, screen } from 'expo-router/testing-library';
import RootLayout from '../_layout';
import HomeScreen from '../index';

describe('root layout on native', () => {
  it('renders exactly one level-1 heading, the title', async () => {
    await renderRouter({ _layout: RootLayout, index: HomeScreen }, { initialUrl: '/' });
    const titles = (await screen.findAllByRole('heading')).filter((heading) => heading.props['aria-level'] === 1);
    expect(titles).toHaveLength(1);
    expect(titles[0]).toHaveTextContent('syntactical_');
  });
});
