import '@/frontend/css/HomePage.css';
import type { FeaturedArtwork } from '@/types/FeaturedArtwork';

// Placeholder data representing artworks posted by other users.
// TODO: replace with real data once the backend is wired back in.
const FEATURED_ARTWORKS: FeaturedArtwork[] = [
    { id: '1', title: 'Fractured Monolith', author: 'ana_dev', category: 'Sculpture', accentFrom: '#7dd3fc', accentTo: '#1e3a8a' },
    { id: '2', title: 'Nightfall Vehicle', author: 'marko3d', category: 'Vehicle', accentFrom: '#6ee7b7', accentTo: '#065f46' },
    { id: '3', title: 'Coral Dreamscape', author: 'lena.render', category: 'Environment', accentFrom: '#f9a8d4', accentTo: '#701a75' },
    { id: '4', title: 'Iron Sentinel', author: 'davidk', category: 'Character', accentFrom: '#fcd34d', accentTo: '#92400e' },
    { id: '5', title: 'Glass Pavilion', author: 'yuki.arch', category: 'Architecture', accentFrom: '#a5b4fc', accentTo: '#3730a3' },
    { id: '6', title: 'Rustbound', author: 'ana_dev', category: 'Prop', accentFrom: '#fca5a5', accentTo: '#7f1d1d' },
    { id: '7', title: 'Shadowmere', author: 'marko3d', category: 'Vehicle', accentFrom: '#6ee7b7', accentTo: '#065f46' },
    { id: '8', title: 'Aetherial', author: 'lena.render', category: 'Environment', accentFrom: '#f9a8d4', accentTo: '#701a75' },
    { id: '9', title: 'Nebula Nexus', author: 'yuki.arch', category: 'Environment', accentFrom: '#a5b4fc', accentTo: '#3730a3' },
    { id: '10', title: 'Stellar Drifter', author: 'alex.space', category: 'Vehicle', accentFrom: '#fbbf24', accentTo: '#92400e' },
    { id: '11', title: 'Stellar Drifter2', author: 'alex.space', category: 'Vehicle', accentFrom: '#fbbf24', accentTo: '#92400e' },
    { id: '12', title: 'Stellar Drifter3', author: 'alex.space', category: 'Vehicle', accentFrom: '#fbbf24', accentTo: '#92400e' },
    { id: '13', title: 'Stellar Drifter4', author: 'alex.space', category: 'Vehicle', accentFrom: '#fbbf24', accentTo: '#92400e' },
];

export default function HomePage() {
    return (
        <div className="home-page">
            <div className="home-hero">
                <h2>Explore the community</h2>
                <p>Browse 3D artworks shared by other creators on PortfolioDDD.</p>
            </div>

            <div className="home-grid">
                {FEATURED_ARTWORKS.map((artwork) => (
                    <div key={artwork.id} className="home-card">
                        <div
                            className="home-card-thumb"
                            style={{ background: `linear-gradient(135deg, ${artwork.accentFrom} 0%, ${artwork.accentTo} 100%)` }}
                        />
                        <div className="home-card-body">
                            <h3 className="home-card-title">{artwork.title}</h3>
                            <p className="home-card-meta">by {artwork.author} · {artwork.category}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
