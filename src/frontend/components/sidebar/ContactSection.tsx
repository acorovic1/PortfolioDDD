import type { ContactSectionProps } from '@/types/ProfileData';
import { MailIcon, GithubIcon, LinkedinIcon } from '@/frontend/svg/Icons';
import { safeUrl, validateLink } from '@/frontend/utils/safeUrl';
import CommitInput from './CommitInput';



export default function ContactSection({ profile, editable, onUpdate }: ContactSectionProps) {
  // Only http(s) links are rendered (a stored "javascript:" link would run on click).
  const github = safeUrl(profile.github);
  const linkedin = safeUrl(profile.linkedin);
  if (!editable && !profile.email && !github && !linkedin) return null;

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
              <CommitInput
                value={profile.github ?? ''}
                onCommit={(value) => onUpdate('github', value.trim())}
                validate={validateLink}
                placeholder="github.com/username"
              />
            </div>
            <div className="contact-item">
              <LinkedinIcon />
              <CommitInput
                value={profile.linkedin ?? ''}
                onCommit={(value) => onUpdate('linkedin', value.trim())}
                validate={validateLink}
                placeholder="linkedin.com/in/username"
              />
            </div>
          </>
        ) : (
          <>
            {profile.email && (
              <a href={`mailto:${profile.email}`} className="contact-link">
                <MailIcon />
                <span>Email</span>
              </a>
            )}
            {github && (
              <a href={github} className="contact-link" target="_blank" rel="noopener noreferrer">
                <GithubIcon />
                <span>GitHub</span>
              </a>
            )}
            {linkedin && (
              <a href={linkedin} className="contact-link" target="_blank" rel="noopener noreferrer">
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