import type { ContactSectionProps } from '@/types/ProfileData';
import { MailIcon, GithubIcon, LinkedinIcon } from '@/frontend/svg/Icons';



export default function ContactSection({ profile, editable, onUpdate }: ContactSectionProps) {
  return (
    <div className="contact-section">
      <h3 className="section-title">Contact</h3>
      <div className="contact-links">
        {editable ? (
          <>
            <div className="contact-item">
              <MailIcon />
              <input
                value={profile.email}
                onChange={(e) => onUpdate('email', e.target.value)}
                placeholder="email@example.com"
              />
            </div>
            <div className="contact-item">
              <GithubIcon />
              <input
                value={profile.github ?? ''}
                onChange={(e) => onUpdate('github', e.target.value)}
                placeholder="github.com/username"
              />
            </div>
            <div className="contact-item">
              <LinkedinIcon />
              <input
                value={profile.linkedin ?? ''}
                onChange={(e) => onUpdate('linkedin', e.target.value)}
                placeholder="linkedin.com/in/username"
              />
            </div>
          </>
        ) : (
          <>
            <a href={`mailto:${profile.email}`} className="contact-link">
              <MailIcon />
              <span>Email</span>
            </a>
            {profile.github && (
              <a href={profile.github} className="contact-link" target="_blank" rel="noopener noreferrer">
                <GithubIcon />
                <span>GitHub</span>
              </a>
            )}
            {profile.linkedin && (
              <a href={profile.linkedin} className="contact-link" target="_blank" rel="noopener noreferrer">
                <LinkedinIcon />
                <span>LinkedIn</span>
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}