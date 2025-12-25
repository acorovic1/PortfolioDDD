import { useState } from 'react'
import Scene3D from './Scene3D'
import Sidebar from './components/Sidebar'
import type { ProfileData } from './types/ProfileData'

function App() {
  const [profile, setProfile] = useState<ProfileData>({
    avatarUrl: '/avatar.jpg',
    name: 'Your Name',
    title: '3D Graphics / Software Engineer',
    email: 'you@email.com'
  })

  return (
    <div className="app-layout">
      
      <div className="toolbar">
        <h2>Portfolio Viewer</h2>
        {/* Add any toolbar buttons or controls here */}
      </div>

      <div className="scene-container">
        <Scene3D artworks={[]} />
      </div>

      <Sidebar profile={profile} onChange={setProfile} />
    </div>
  )
}

export default App
