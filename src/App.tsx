import { useState, useRef } from 'react';
import Scene3D from './Scene3D';
import Sidebar from './components/Sidebar';
import Toolbar from './components/Toolbar';
import type { ProfileData } from './types/ProfileData';

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

  const handleViewModeChange = (mode: 'view' | 'edit') => {
    setEditable(mode === 'edit');
    console.log('View mode changed to:', mode);
  };

  const handleSearch = (query: string) => {
    console.log('Search query:', query);
    // TODO: Implement artwork search functionality
  };

  return (
    <div className="app-layout">
      <Toolbar 
        onViewModeChange={handleViewModeChange}
        onSearch={handleSearch}
      />

      <div ref={sceneContainerRef} className="scene-container">
        <Scene3D artworks={[]} />
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