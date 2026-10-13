// On the web the judged card's source and the query's doc links render as real links that open a
// new tab without handing the opener over, and the drawer stays free of axe violations.
import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import { QueryDrawer } from '../QueryDrawer';

expect.extend(toHaveNoViolations);

jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }));

const query = { explanation: 'Bind parameters instead of concatenating.', title: 'Prepared statements' };
const SOURCE = {
  quote: 'Use of Prepared Statements (with Parameterized Queries)',
  title: 'SQL Injection Prevention Cheat Sheet',
  url: 'https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html',
};

describe('QueryDrawer source link on the web', () => {
  it('renders "Source: <title>" as a link with target _blank and rel noopener noreferrer', () => {
    render(<QueryDrawer isAnswered isOpen query={query} grammar="plain" evidenceSource={SOURCE} onClose={jest.fn()} />);
    const link = screen.getByRole('link', { name: 'Source: SQL Injection Prevention Cheat Sheet' });
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe(SOURCE.url);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('renders no link without a source', () => {
    render(<QueryDrawer isAnswered isOpen query={query} grammar="plain" onClose={jest.fn()} />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('has no axe violations with the link', async () => {
    render(<QueryDrawer isAnswered isOpen query={query} grammar="plain" evidenceSource={SOURCE} onClose={jest.fn()} />);
    expect(screen.getByRole('link', { name: /^Source:/ })).toBeTruthy();
    expect(await axe(document.body, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations();
  });

  it('renders doc links before an answer as new-tab links, with no axe violations', async () => {
    const docs = [{ title: 'PREPARE', url: 'https://www.postgresql.org/docs/current/sql-prepare.html' }];
    render(<QueryDrawer isAnswered={false} isOpen query={{ ...query, docs }} grammar="plain" onClose={jest.fn()} />);
    const link = screen.getByRole('link', { name: 'PREPARE' });
    expect(link.getAttribute('href')).toBe(docs[0].url);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(await axe(document.body, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations();
  });
});
