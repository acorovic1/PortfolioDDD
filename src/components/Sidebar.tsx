import type { ProfileData } from '../types/ProfileData'

type SidebarProps = {
  profile: ProfileData
  editable?: boolean
  onChange?: (next: ProfileData) => void
}

export default function Sidebar({
  profile,
  editable = false,
  onChange
}: SidebarProps) {
  const update = (key: keyof ProfileData, value: string) => {
    if (!onChange) return
    onChange({ ...profile, [key]: value })
  }

  return (
    <aside className="sidebar">
      <img src={profile.avatarUrl} className="avatar" />

      {editable ? (
        <>
          <input value={profile.name} onChange={e => update('name', e.target.value)} />
          <input value={profile.title} onChange={e => update('title', e.target.value)} />
          <input value={profile.email} onChange={e => update('email', e.target.value)} />
          <input value={profile.github ?? ''} onChange={e => update('github', e.target.value)} placeholder="GitHub" />
          <input value={profile.linkedin ?? ''} onChange={e => update('linkedin', e.target.value)} placeholder="LinkedIn" />
        </>
      ) : (
        <>
          <h2>{profile.name}</h2>
          <p>{profile.title}</p>
          <a href={`mailto:${profile.email}`}>{profile.email}</a>
          {profile.github && <a href={profile.github}>GitHub</a>}
          {profile.linkedin && <a href={profile.linkedin}>LinkedIn</a>}
        </>
      )}
    </aside>
  )
}
