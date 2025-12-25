import { useState } from 'react';
import type { PortfolioPiece } from '../PortfolioPiece';
import RenderGallery from './RenderGallery';
import ArtworkInfo from './ArtworkInfo';
import '../css/ArtworkShowcase.css';

type ArtworkShowcaseProps = {
    artworks: PortfolioPiece[];
    selectedIndex: number;
};

export default function ArtworkShowcase({ artworks, selectedIndex }: ArtworkShowcaseProps) {
    const [activeTab, setActiveTab] = useState<'renders' | 'info'>('renders');

    const selectedArtwork = artworks[selectedIndex];

    // Mock data for demonstration - replace with real artwork data
    const mockRenders = [
        { id: 1, url: 'https://picsum.photos/seed/render1/800/600', caption: 'Front View' },
        { id: 2, url: 'https://picsum.photos/seed/render2/800/600', caption: 'Side View' },
        { id: 3, url: 'https://picsum.photos/seed/render3/800/600', caption: 'Top View' },
        { id: 4, url: 'https://picsum.photos/seed/render4/800/600', caption: 'Detail Shot' },
        { id: 5, url: 'https://picsum.photos/seed/render5/800/600', caption: 'Wireframe' },
        { id: 6, url: 'https://picsum.photos/seed/render6/800/600', caption: 'Material Test' },
    ];

    const mockInfo = {
        title: selectedArtwork?.id || 'Untitled Project',
        description: 'A stunning 3D visualization showcasing advanced modeling techniques and realistic materials. This piece demonstrates proficiency in lighting, composition, and attention to detail.',
        tools: ['Blender', 'Substance Painter', 'Three.js'],
        year: '2024',
        category: '3D Modeling',
        polyCount: '45,230',
        renderTime: '2h 15m',
    };

    if (artworks.length === 0) {
        return (
            <div className="artwork-showcase empty">
                <div className="empty-state">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <h3>No Artworks Yet</h3>
                    <p>Click the yellow sphere in the 3D scene to add your first artwork</p>
                </div>
            </div>
        );
    }

    return (
        <div className="artwork-showcase">
            <div className="showcase-header">
                {/* <div className="showcase-tabs">
          <button 
            className={`tab ${activeTab === 'renders' ? 'active' : ''}`}
            onClick={() => setActiveTab('renders')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            Renders
          </button>
          <button 
            className={`tab ${activeTab === 'info' ? 'active' : ''}`}
            onClick={() => setActiveTab('info')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            Info
          </button>
        </div> */}

                <div className="artwork-title" >
                    <h2>{mockInfo.title}</h2>

                </div>
            </div>

            <div className="showcase-content">

                <RenderGallery renders={mockRenders} />

                <ArtworkInfo info={mockInfo} />

            </div>
        </div>
    );
}