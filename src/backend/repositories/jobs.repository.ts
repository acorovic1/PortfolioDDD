import { pool } from '../config/db.ts';
import { notBlockedCondition } from './moderation.repository.ts';

export type JobDTO = {
  id: string;
  title: string;
  company: string;
  location: string;
  workplace: 'onsite' | 'hybrid' | 'remote';
  employmentType: 'full_time' | 'part_time' | 'contract' | 'freelance' | 'internship';
  salary: string | null;
  description: string;
  skills: string[];
  applyUrl: string | null;
  isOpen: boolean;
  createdAt: string;
  expiresAt: string | null;
  poster: { username: string; avatarUrl: string | null };
  // Only for the poster.
  applicationCount?: number;
  // Only for signed-in viewers.
  hasApplied?: boolean;
};

export type JobInput = {
  title: string;
  company: string;
  location?: string;
  workplace: JobDTO['workplace'];
  employmentType: JobDTO['employmentType'];
  salary?: string;
  description: string;
  skills?: string[];
  applyUrl?: string;
  expiresAt?: string | null;
};

const SELECT_JOB = (viewerParam: string) => `
  SELECT j.id, j.title, j.company, j.location, j.workplace, j.employment_type AS "employmentType",
         j.salary, j.description, j.skills, j.apply_url AS "applyUrl", j.is_open AS "isOpen",
         j.created_at AS "createdAt", j.expires_at AS "expiresAt",
         json_build_object('username', u.username, 'avatarUrl', u.avatar_url) AS poster,
         CASE WHEN j.poster_id = ${viewerParam}
           THEN (SELECT COUNT(*)::int FROM job_applications a WHERE a.job_id = j.id) END AS "applicationCount",
         EXISTS (SELECT 1 FROM job_applications a WHERE a.job_id = j.id AND a.applicant_id = ${viewerParam}) AS "hasApplied"
  FROM jobs j JOIN users u ON u.id = j.poster_id`;

// Open, unexpired postings from active accounts.
const LIVE = `j.is_open AND (j.expires_at IS NULL OR j.expires_at > NOW()) AND u.suspended_at IS NULL`;

export async function listJobs(filters: {
  viewerId: string | null;
  q?: string;
  employmentType?: string;
  workplace?: string;
  skill?: string;
  mine?: boolean;
  limit: number;
  offset: number;
}): Promise<{ jobs: JobDTO[]; hasMore: boolean }> {
  const params: unknown[] = [filters.viewerId];
  const param = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  // "My postings" shows the poster's closed/expired jobs too.
  const conditions = filters.mine ? ['j.poster_id = $1'] : [LIVE];
  if (filters.viewerId && !filters.mine) conditions.push(notBlockedCondition('j.poster_id', '$1'));
  if (filters.q) {
    const like = param(`%${filters.q}%`);
    conditions.push(`(j.title ILIKE ${like} OR j.company ILIKE ${like} OR j.description ILIKE ${like})`);
  }
  if (filters.employmentType) conditions.push(`j.employment_type = ${param(filters.employmentType)}`);
  if (filters.workplace) conditions.push(`j.workplace = ${param(filters.workplace)}`);
  if (filters.skill) conditions.push(`LOWER(${param(filters.skill)}) = ANY(SELECT LOWER(s) FROM unnest(j.skills) s)`);

  const { rows } = await pool.query<JobDTO>(
    `${SELECT_JOB('$1')}
     WHERE ${conditions.join(' AND ')}
     ORDER BY j.created_at DESC
     LIMIT ${param(filters.limit + 1)} OFFSET ${param(filters.offset)}`,
    params
  );
  return { jobs: rows.slice(0, filters.limit), hasMore: rows.length > filters.limit };
}

export async function findJob(id: string, viewerId: string | null): Promise<(JobDTO & { posterId: string; live: boolean }) | null> {
  const { rows } = await pool.query<JobDTO & { posterId: string; live: boolean }>(
    `SELECT job.*, j2.poster_id AS "posterId",
            (j2.is_open AND (j2.expires_at IS NULL OR j2.expires_at > NOW())) AS live
     FROM (${SELECT_JOB('$2')} WHERE j.id = $1) AS job
     JOIN jobs j2 ON j2.id = job.id`,
    [id, viewerId]
  );
  return rows[0] ?? null;
}

export async function createJob(id: string, posterId: string, job: JobInput): Promise<void> {
  await pool.query(
    `INSERT INTO jobs (id, poster_id, title, company, location, workplace, employment_type, salary,
                       description, skills, apply_url, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [id, posterId, job.title, job.company, job.location ?? '', job.workplace, job.employmentType,
      job.salary || null, job.description, job.skills ?? [], job.applyUrl || null, job.expiresAt ?? null]
  );
}

export async function updateJob(id: string, job: Partial<JobInput> & { isOpen?: boolean }): Promise<void> {
  const columns: Record<string, string> = {
    title: 'title', company: 'company', location: 'location', workplace: 'workplace',
    employmentType: 'employment_type', salary: 'salary', description: 'description', skills: 'skills',
    applyUrl: 'apply_url', expiresAt: 'expires_at', isOpen: 'is_open',
  };
  const entries = Object.entries(job).filter(([key, value]) => value !== undefined && columns[key]);
  if (entries.length === 0) return;
  await pool.query(
    `UPDATE jobs SET ${entries.map(([key], i) => `${columns[key]} = $${i + 2}`).join(', ')} WHERE id = $1`,
    [id, ...entries.map(([key, value]) => (key === 'applyUrl' || key === 'salary') && value === '' ? null : value)]
  );
}

export async function deleteJob(id: string): Promise<void> {
  await pool.query('DELETE FROM jobs WHERE id = $1', [id]);
}

// False if they already applied.
export async function addApplication(jobId: string, applicantId: string, message: string): Promise<boolean> {
  const result = await pool.query(
    `INSERT INTO job_applications (job_id, applicant_id, message) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [jobId, applicantId, message]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function listApplications(jobId: string): Promise<{ username: string; avatarUrl: string | null; title: string | null; message: string; createdAt: string }[]> {
  const { rows } = await pool.query(
    `SELECT u.username, u.avatar_url AS "avatarUrl", u.title, a.message, a.created_at AS "createdAt"
     FROM job_applications a JOIN users u ON u.id = a.applicant_id
     WHERE a.job_id = $1
     ORDER BY a.created_at DESC`,
    [jobId]
  );
  return rows;
}
