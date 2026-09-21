import type { SkillsSectionProps } from '@/types/ProfileData';
import { PlusIcon } from '@/frontend/svg/Icons';



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
            <PlusIcon />
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