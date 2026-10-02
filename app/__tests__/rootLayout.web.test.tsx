import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';

import { createQueryClient } from '../../config/queryClient';
import { ContentProvider } from '../../state/ContentProvider';
import { StatsProvider } from '../../state/StatsProvider';
import HomeScreen from '../index';

function renderHomeScreen() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ContentProvider contentBaseUrl={null}>
        <StatsProvider>
          <HomeScreen />
        </StatsProvider>
      </ContentProvider>
    </QueryClientProvider>,
  );
}

describe('home screen on the web', () => {
  it('renders exactly one h1 carrying the app title, above the language list', async () => {
    renderHomeScreen();
    await waitFor(() => expect(screen.queryByText('Python')).not.toBeNull());
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('syntactical_');
    expect(screen.queryByText('Postgres')).not.toBeNull();
    expect(screen.queryByText('JavaScript')).not.toBeNull();
  });
});
