import { useState } from 'react';
import type { ProfileData,SidebarProps } from '@/types/ProfileData';
import ProfileHeader from './ProfileHeader';
import ContactSection from './ContactSection';
import BioSection from './BioSection';
import SkillsSection from './SkillsSection';
import '@/frontend/css/Sidebar.css';



export default function Sidebar({
  profile,
  editable = false,
  onChange,
  onAvatarUpload,
  children,
}: SidebarProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const update = (key: keyof ProfileData, value: string | string[]) => {
    if (!onChange) return;
    onChange({ ...profile, [key]: value });
  };

  return (
    <aside className="sidebar-enhanced">
      <ProfileHeader
        profile={profile}
        editable={editable}
        onUpdate={update}
        onAvatarUpload={onAvatarUpload}
      />

      {children}

      
      <ContactSection 
        profile={profile} 
        editable={editable} 
        onUpdate={update} 
      />
      
      <BioSection 
        profile={profile} 
        editable={editable} 
        onUpdate={update} 
      />
      
      <SkillsSection 
        profile={profile} 
        editable={editable} 
        onUpdate={update} 
      />

      <button 
        className="expand-btn" 
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? 'Show Less' : 'Show More HOHOHOHOHOO'}
      </button>
    </aside>
  );
}