import { useState, useRef } from 'react';
import Scene3D from './Scene3D';
import Sidebar from './components/Sidebar';
import Toolbar from './components/Toolbar';
import ArtworkShowcase from './components/ArtworkShowcase';
import type { ProfileData } from './types/ProfileData';
import type { PortfolioPiece } from './PortfolioPiece';

function App() {
  const sceneContainerRef = useRef<HTMLDivElement>(null);
  
  const [profile, setProfile] = useState<ProfileData>({
    avatarUrl: 'public/vite.svg',
    name: 'Dadan Corelli',
    title: '3D Graphics Engineer',
    email: 'dcorelli1@example.com',
    github: 'https://github.com/dcorelli1',
    linkedin: 'https://linkedin.com/in/dcorelli1',
    bio: 'Passionate about creating immersive 3D experiences. Specializing in WebGL, Three.js, and real-time graphics. Always learning, always building.',
    skills: ['Three.js', 'WebGL', 'React', 'TypeScript', 'GLSL', 'Blender'],
    location: 'Vogošća, Bosnia and Herzegovina'
  });

  const [editable, setEditable] = useState(false);
  const [selectedArtworkIndex, setSelectedArtworkIndex] = useState(0);
  const [artworks, setArtworks] = useState<PortfolioPiece[]>([]);

  const handleViewModeChange = (mode: 'view' | 'edit') => {
    setEditable(mode === 'edit');
  };

  const handleSearch = (query: string) => {
    console.log('Search query:', query);
  };

  const handleArtworkAdd = (newArtwork: PortfolioPiece) => {
    setArtworks(prev => [...prev, newArtwork]);
  };

  const handleRenderAdd = (artworkIndex: number, renderUrl: string, caption: string) => {
    // TODO: Add render to specific artwork
    console.log('Add render to artwork', artworkIndex, renderUrl, caption);
  };

  return (
    <div className="app-layout">
      <Toolbar 
        onViewModeChange={handleViewModeChange}
        onSearch={handleSearch}
      />

      <div className="portfolio">
        <div ref={sceneContainerRef} className="scene">
          <Scene3D 
            artworks={artworks}
            containerRef={sceneContainerRef}
            onArtworkIndexChange={setSelectedArtworkIndex}
            onArtworkAdd={handleArtworkAdd}
            editable={editable}
          />
        </div>

        <ArtworkShowcase 
          artworks={artworks}
          selectedIndex={selectedArtworkIndex}
          editable={editable}
          onRenderAdd={handleRenderAdd}
        />
      </div>

      <Sidebar 
        profile={profile} 
        editable={editable}
        onChange={setProfile} 
      />
    </div>
  );
}

export default App;