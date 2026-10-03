import { render, screen } from '@testing-library/react-native';
import { View } from 'react-native';

import { QualityStat } from '../QualityStat';
import { QualityTable } from '../QualityTable';

describe('QualityStat', () => {
  it('speaks the label and value from one list item and hides the visible texts from assistive tech', async () => {
    await render(<QualityStat label="Questions audited" value="27" />);
    const item = screen.getByLabelText('Questions audited: 27');
    expect(item.props.role).toBe('listitem');
    expect(screen.getByText('27', { includeHiddenElements: true }).props['aria-hidden']).toBe(true);
    expect(screen.getByText('Questions audited', { includeHiddenElements: true }).props['aria-hidden']).toBe(true);
  });

  it('puts aria-label only on elements that have a role, which ARIA requires', async () => {
    await render(
      <View>
        <QualityStat label="Questions audited" value="27" />
        <QualityTable banks={[{ audited: 3, bankKey: 'python/easy', failed: 1, notExecutable: 1, passed: 1 }]} />
      </View>,
    );
    const labeled = screen.getAllByLabelText(/.+/, { includeHiddenElements: true });
    expect(labeled.length).toBeGreaterThan(5);
    for (const element of labeled) {
      expect(element.props.role).toBeDefined();
    }
  });
});
