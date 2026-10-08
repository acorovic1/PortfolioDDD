export type Workplace = 'onsite' | 'hybrid' | 'remote';
export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'freelance' | 'internship';

export type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  workplace: Workplace;
  employmentType: EmploymentType;
  salary: string | null;
  description: string;
  skills: string[];
  applyUrl: string | null;
  isOpen: boolean;
  createdAt: string;
  expiresAt: string | null;
  poster: { username: string; avatarUrl: string | null };
  applicationCount?: number | null;
  hasApplied?: boolean;
};

export const WORKPLACE_LABELS: Record<Workplace, string> = {
  onsite: 'On-site',
  hybrid: 'Hybrid',
  remote: 'Remote',
};

export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  freelance: 'Freelance',
  internship: 'Internship',
};

export type License = 'personal' | 'commercial' | 'editorial' | 'cc_by' | 'cc0';

export const LICENSE_LABELS: Record<License, { label: string; hint: string }> = {
  personal: { label: 'Personal use', hint: 'Non-commercial projects only' },
  commercial: { label: 'Commercial', hint: 'Use in commercial products' },
  editorial: { label: 'Editorial', hint: 'News, education and commentary' },
  cc_by: { label: 'CC BY', hint: 'Free to use with credit' },
  cc0: { label: 'CC0', hint: 'Public domain, no credit needed' },
};

export type Listing = {
  id: string;
  artworkId: string;
  priceCents: number;
  currency: string;
  license: License;
  description: string | null;
  isActive: boolean;
  downloads: number;
  createdAt: string;
  isSeller?: boolean;
};

export type MarketplaceItem = Listing & {
  title: string;
  thumbnailUrl: string | null;
  coverUrl: string | null;
  username: string;
  avatarUrl: string | null;
  likeCount: number;
  viewCount: number;
  isMature: boolean;
  aiGenerated: boolean;
};

export function formatPrice(cents: number, currency = 'USD'): string {
  if (cents === 0) return 'Free';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

export type ChallengeStatus = 'upcoming' | 'active' | 'ended';

export type Challenge = {
  id: string;
  title: string;
  brief: string;
  rules: string | null;
  prize: string | null;
  startsAt: string;
  endsAt: string;
  status: ChallengeStatus;
  entryCount: number;
};

export type ChallengeEntry = {
  artworkId: string;
  title: string;
  thumbnailUrl: string | null;
  coverUrl: string | null;
  username: string;
  avatarUrl: string | null;
  likeCount: number;
  viewCount: number;
  isMature: boolean;
  aiGenerated: boolean;
  votes: number;
  rank: number;
  votedByViewer: boolean;
  submittedAt: string;
};
