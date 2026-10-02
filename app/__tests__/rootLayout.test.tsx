import { renderRouter, screen } from 'expo-router/testing-library';
import RootLayout from '../_layout';
import HomeScreen from '../index';

describe('root layout on native', () => {
  it('renders exactly one heading-role title', async () => {
    await renderRouter({ _layout: RootLayout, index: HomeScreen }, { initialUrl: '/' });
    expect(await screen.findAllByRole('heading')).toHaveLength(1);
    expect(screen.getByRole('heading')).toHaveTextContent('syntactical_');
  });
});
