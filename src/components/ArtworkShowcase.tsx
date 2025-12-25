import { useState } from 'react';
import type { PortfolioPiece } from '../PortfolioPiece';
import RenderGallery from './RenderGallery';
import ArtworkInfo from './ArtworkInfo';
import '../css/ArtworkShowcase.css';

type ArtworkShowcaseProps = {
    artworks: PortfolioPiece[];
    selectedIndex: number;
    editable?: boolean;
    onRenderAdd?: (artworkIndex: number, renderUrl: string, caption: string) => void;
};

export default function ArtworkShowcase({
    artworks,
    selectedIndex,
    editable = false,
    onRenderAdd
}: ArtworkShowcaseProps) {
    const [activeTab, setActiveTab] = useState<'renders' | 'info'>('renders');

    const selectedArtwork = artworks[selectedIndex];

    const mockRenders = [
        { id: 1, url: 'https://picsum.photos/seed/render1/800/600', caption: 'Front View' },
        { id: 2, url: 'https://picsum.photos/seed/render2/800/600', caption: 'Side View' },
        { id: 3, url: 'https://picsum.photos/seed/render3/800/600', caption: 'Top View' },
        { id: 4, url: 'https://picsum.photos/seed/render4/800/600', caption: 'Detail Shot' },
        { id: 5, url: 'https://picsum.photos/seed/render5/800/600', caption: 'Wireframe' },
        { id: 6, url: 'https://picsum.photos/seed/render6/800/600', caption: 'Material Test' },
        { id: 6, url: 'https://picsum.photos/seed/render7/800/600', caption: 'HOHO' },
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

    const handleAddRender = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                const url = URL.createObjectURL(file);
                const caption = prompt('Enter caption for this render:') || 'Untitled';
                onRenderAdd?.(selectedIndex, url, caption);
            }
        };
        input.click();
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
                    <p>
                        {editable
                            ? 'Click the yellow sphere in the 3D scene to add your first artwork'
                            : 'Switch to Edit Mode to add artworks'
                        }
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="artwork-showcase">

            <div className="artwork-title">
                <h2>{mockInfo.title}</h2>
            </div>





            <div className="showcase-content">

                <RenderGallery renders={mockRenders} editable={editable} />

                <ArtworkInfo info={mockInfo} />

            </div>


        </div>
    );
}