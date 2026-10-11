import { useMemo } from 'react';
import type { PortfolioPiece } from '@/types/PortfolioPiece';
import { countVertices } from '@/frontend/three/sceneUtils';

type PortfolioStatsPanelProps = {
  artworks: PortfolioPiece[];
  frontIndex: number;
};

// Edit-mode overlay summarising the portfolio and the front artwork.
export default function PortfolioStatsPanel({ artworks, frontIndex }: PortfolioStatsPanelProps) {
  const stats = useMemo(() => {
    const frontArtwork = artworks[frontIndex];
    return {
      totalRenders: artworks.reduce((sum, a) => sum + a.renders.length, 0),
      vertexCount: countVertices(frontArtwork),
      frontTitle: frontArtwork?.infoData.title || '—',
    };
  }, [artworks, frontIndex]);

  return (
    <div className="info-panel">
      <h4 className="info-panel-title">Portfolio Analytics</h4>
      <div className="info-panel-row">
        <span>Current artwork</span>
        <span>{stats.frontTitle}</span>
      </div>
      <div className="info-panel-row">
        <span>Position</span>
        <span>{artworks.length > 0 ? frontIndex + 1 : 0} / {artworks.length}</span>
      </div>
      <div className="info-panel-row">
        <span>Total artworks</span>
        <span>{artworks.length}</span>
      </div>
      <div className="info-panel-row">
        <span>Total renders</span>
        <span>{stats.totalRenders}</span>
      </div>
      <div className="info-panel-row">
        <span>Number of vertices</span>
        <span>{stats.vertexCount.toLocaleString()}</span>
      </div>
    </div>
  );
}
