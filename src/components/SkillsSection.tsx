import type { ProfileData } from '../types/ProfileData';

type SkillsSectionProps = {
  profile: ProfileData;
  editable: boolean;
  onUpdate: (key: keyof ProfileData, value: string[]) => void;
};

export default function SkillsSection({ profile, editable, onUpdate }: SkillsSectionProps) {
  const addSkill = () => {
    const skills = profile.skills || [];
    onUpdate('skills', [...skills, 'New Skill']);
  };

  const removeSkill = (index: number) => {
    const skills = profile.skills || [];
    onUpdate('skills', skills.filter((_, i) => i !== index));
  };

  const updateSkill = (index: number, value: string) => {
    const skills = profile.skills || [];
    const updated = [...skills];
    updated[index] = value;
    onUpdate('skills', updated);
  };

  return (
    <div className="skills-section">
      <div className="section-header">
        <h3 className="section-title">Skills</h3>
        {editable && (
          <button onClick={addSkill} className="add-btn" title="Add skill">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        )}
      </div>
      <div className="skills-grid">
        {editable ? (
          (profile.skills || []).map((skill, i) => (
            <div key={i} className="skill-edit">
              <input
                value={skill}
                onChange={(e) => updateSkill(i, e.target.value)}
                className="skill-input"
              />
              <button onClick={() => removeSkill(i)} className="remove-btn" title="Remove">
                ×
              </button>
            </div>
          ))
        ) : (
          (profile.skills || ['React', 'Three.js', 'TypeScript', 'WebGL']).map((skill, i) => (
            <span key={i} className="skill-tag">
              {skill}
            </span>
          ))
        )}
      </div>
    </div>
  );
}