import { useState, useRef } from 'react';
import Scene3D from './components/Scene3D';
import Sidebar from './components/Sidebar';
import Toolbar from './components/Toolbar';
import ArtworkShowcase from './components/ArtworkShowcase';
import type { ProfileData } from './types/ProfileData';
import type { PortfolioPiece } from './types/PortfolioPiece';
import type { ArtworkInfoData } from './types/ArtworkInfoData';
import { pickPortfolioImage } from './types/PortfolioPiece';
import LoginForm from './components/LoginForm';
import { useAuth } from './contexts/AuthContext';
import { usePortfolio } from './hooks/usePortfolio';



// Znaci... ovaj artworks sada mora biti tipa PortfolioPiece[]... 

// u portfolioPiece razdvoji 3D djavole od slika i infoa.. 


function App() {
  const sceneContainerRef = useRef<HTMLDivElement>(null);

  const { user, isLoading } = useAuth();
  // const { artworks , addArtwork, updateArtwork, addRender, deleteRender } = usePortfolio();

  const [editable, setEditable] = useState(false);
  const [selectedArtworkIndex, setSelectedArtworkIndex] = useState(0);
  const [artworks, setArtworks] = useState<PortfolioPiece[]>([]);

  const handleViewModeChange = (mode: 'view' | 'edit') => {
    setEditable(mode === 'edit');

    // console.log("Change mode.. number of artworks = ",artworks.length)
    // artworks.forEach(element => {

    //   console.log("Change mode - Object with title ", element.infoData.title, " has ", element.renders.length, " renders!");
    // });
  };

  const handleSearch = (query: string) => {
    console.log('Search query:', query);
  };

  const onArtworkAdd = (newArtwork: PortfolioPiece) => {
     setArtworks(prev => [...prev, newArtwork]);
    //addArtwork(newArtwork);

  };

  const onRenderAdd = async () => {
    const img = await pickPortfolioImage();
    if (!img) return;

    setArtworks(prev => {
      if (selectedArtworkIndex < 0 || selectedArtworkIndex >= prev.length) {
        return prev; // safety
      }

      const updated = [...prev];

      updated[selectedArtworkIndex] = {
        ...updated[selectedArtworkIndex],
        renders: [
          ...(updated[selectedArtworkIndex].renders ?? []),
          img
        ]
      };

      return updated;
    });
  };

  const onInfoUpdate = (key: keyof ArtworkInfoData, value: string | string[]) => {

    console.log("User artworks: ",artworks?.length)

    setArtworks(prev => {
      const arr = [...prev];
      arr[selectedArtworkIndex] = {
        ...arr[selectedArtworkIndex],
        infoData: {
          ...arr[selectedArtworkIndex].infoData,
          [key]: value
        }
      };
      return arr;
    });
  };



    const [profile, setProfile] = useState<ProfileData>({
    avatarUrl: 'public/vite.svg',
    name: user?.name || 'Captain Hook',
    title: '3D Graphics Engineer',
    email: user?.email || 'chook1@email.com',
    bio:  'Passionate about creating immersive 3D experiences.',
    skills:  ['Three.js', 'WebGL', 'React', 'TypeScript'],
    location:  ''
  });



  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  } else

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
              onArtworkAdd={onArtworkAdd}
              editable={editable}
            />
          </div>


          <ArtworkShowcase
            artworks={artworks}
            selectedIndex={selectedArtworkIndex}
            editable={editable}
            onRenderAdd={onRenderAdd}
            onInfoUpdate={onInfoUpdate}

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