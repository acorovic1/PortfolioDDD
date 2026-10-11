import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PortfolioStatsPanel from './PortfolioStatsPanel';
import { cubePiece } from '@/frontend/three/testPieces';

function row(label: string) {
  return screen.getByText(label).nextElementSibling?.textContent;
}

describe('PortfolioStatsPanel', () => {
  it('summarises the portfolio and the front artwork', () => {
    const a = cubePiece('Robot');
    const b = cubePiece('Castle');
    a.renders = [{ id: 'r1', url: 'x', caption: '' }];
    b.renders = [{ id: 'r2', url: 'y', caption: '' }, { id: 'r3', url: 'z', caption: '' }];

    render(<PortfolioStatsPanel artworks={[a, b]} frontIndex={1} />);

    expect(row('Current artwork')).toBe('Castle');
    expect(row('Position')).toBe('2 / 2');
    expect(row('Total artworks')).toBe('2');
    expect(row('Total renders')).toBe('3');
    expect(row('Number of vertices')).toBe('24');
  });

  it('handles an empty portfolio', () => {
    render(<PortfolioStatsPanel artworks={[]} frontIndex={0} />);

    expect(row('Current artwork')).toBe('—');
    expect(row('Position')).toBe('0 / 0');
    expect(row('Number of vertices')).toBe('0');
  });
});
