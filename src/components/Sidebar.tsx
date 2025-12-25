import { useState } from 'react';
import type { ProfileData } from '../types/ProfileData';
import ProfileHeader from './ProfileHeader';
import ContactSection from './ContactSection';
import BioSection from './BioSection';
import SkillsSection from './SkillsSection';
import '../css/Sidebar.css';

type SidebarProps = {
  profile: ProfileData;
  editable?: boolean;
  onChange?: (next: ProfileData) => void;
};

export default function Sidebar({
  profile,
  editable = false,
  onChange
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
      />
      
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