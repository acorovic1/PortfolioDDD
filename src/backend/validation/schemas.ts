import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(6).max(200),
  username: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, - and _'),
  name: z.string().trim().min(1).max(255).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(1).max(200),
});

// Profile links must be http(s) URLs (they're rendered as links). A bare
// "example.com" is accepted and stored with https://.
const profileUrl = z.string().trim().max(255).transform((value, ctx) => {
  if (value === '') return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    const isWeb = url.protocol === 'http:' || url.protocol === 'https:';
    if (isWeb && !/\s/.test(value) && url.hostname.includes('.')) return url.toString();
  } catch {
    // fall through
  }
  ctx.addIssue({ code: 'custom', message: 'Must be a web link (http or https)' });
  return z.NEVER;
});

export const SOCIAL_NETWORKS = ['artstation', 'sketchfab', 'instagram', 'x', 'youtube', 'behance'] as const;

const experienceEntry = z.object({
  role: z.string().trim().min(1).max(120),
  company: z.string().trim().max(120).default(''),
  location: z.string().trim().max(120).optional(),
  start: z.string().trim().regex(/^\d{4}(-\d{2})?$/, 'Use YYYY or YYYY-MM'),
  end: z.union([z.string().trim().regex(/^\d{4}(-\d{2})?$/, 'Use YYYY or YYYY-MM'), z.literal('')]).optional(),
  description: z.string().trim().max(1000).optional(),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  avatarUrl: z.string().trim().max(512).optional(),
  title: z.string().trim().max(255).optional(),
  bio: z.string().trim().max(2000).optional(),
  location: z.string().trim().max(255).optional(),
  github: profileUrl.optional(),
  linkedin: profileUrl.optional(),
  skills: z.array(z.string().trim().max(64)).max(50).optional(),
  website: profileUrl.optional(),
  socialLinks: z.partialRecord(z.enum(SOCIAL_NETWORKS), profileUrl).optional(),
  availableForWork: z.boolean().optional(),
  workTypes: z.array(z.enum(['freelance', 'full_time', 'contract', 'commissions'])).max(4).optional(),
  experience: z.array(experienceEntry).max(20).optional(),
  showMature: z.boolean().optional(),
  hideAi: z.boolean().optional(),
  noAiTraining: z.boolean().optional(),
  emailNotifications: z.boolean().optional(),
  locale: z.enum(['en', 'bs', 'de']).optional(),
  messagesFrom: z.enum(['everyone', 'following', 'nobody']).optional(),
});

export const updateUsernameSchema = z.object({
  username: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, - and _'),
});

export const updateEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(1).max(200),
  // Required when two-factor is on: an authenticator or recovery code.
  code: z.string().trim().min(6).max(32).optional(),
});

export const createArtworkSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(2000).optional(),
  year: z.string().trim().max(16).optional(),
  category: z.string().trim().max(128).optional(),
  tools: z.union([z.string(), z.array(z.string())]).optional(),
});

// Upload form fields arrive as multipart strings.
export const uploadArtworkSchema = createArtworkSchema.extend({
  draft: z.enum(['true', 'false']).optional(),
  // ISO time to publish at (checked by the controller, which also removes
  // the upload if it's rejected).
  publishAt: z.string().max(64).optional(),
});

export const CANVAS_EDGES = ['black', 'white'] as const;
export const ARTWORK_MEDIUMS = [
  'digital_painting', 'oil', 'acrylic', 'watercolour', 'gouache', 'ink', 'pencil', 'charcoal', 'mixed_media', 'print',
] as const;

// How a 2D artwork's canvas is presented (see CanvasSettings).
export const canvasSettingsSchema = z.object({
  edge: z.enum(CANVAS_EDGES),
  medium: z.enum(ARTWORK_MEDIUMS).nullable(),
});

// A 2D artwork upload: the canvas settings arrive as multipart strings too
// ('' = not given).
export const uploadImageArtworkSchema = createArtworkSchema.extend({
  draft: z.enum(['true', 'false']).optional(),
  publishAt: z.string().max(64).optional(),
  edge: z.enum(CANVAS_EDGES).optional(),
  medium: z.union([z.literal(''), z.enum(ARTWORK_MEDIUMS)]).optional(),
});

// A video artwork upload: the canvas fields, plus what the uploader's
// browser read from the video (the server doesn't decode video).
export const uploadVideoArtworkSchema = uploadImageArtworkSchema.extend({
  width: z.coerce.number().int().min(1).max(16384),
  height: z.coerce.number().int().min(1).max(16384),
  // Seconds; up to 6 hours.
  duration: z.coerce.number().positive().max(6 * 3600),
});

const unit = z.number().finite().min(-1).max(1);

// Mirrors the frontend's inspector settings (src/frontend/inspector).
export const viewerSettingsSchema = z.object({
  post: z.object({
    environment: z.boolean(),
    toneMapping: z.enum(['none', 'aces', 'agx', 'neutral']),
    exposure: z.number().min(0.1).max(3),
    ambientOcclusion: z.boolean(),
    bloom: z.boolean(),
    bloomStrength: z.number().min(0).max(3),
    vignette: z.boolean(),
    background: z.string().regex(/^#[0-9a-f]{6}$/i).nullable(),
  }),
  // Viewing direction in the model's own frame + zoom relative to "fit".
  camera: z.object({
    direction: z.tuple([unit, unit, unit]),
    distanceFactor: z.number().min(0.05).max(20),
  }).nullable(),
  autoRotate: z.boolean(),
});

// A unit quaternion [x, y, z, w].
export const modelRotationSchema = z.tuple([unit, unit, unit, unit]).refine(
  ([x, y, z, w]) => Math.abs(Math.hypot(x, y, z, w) - 1) < 1e-3,
  'Must be a unit quaternion'
);

export const updateArtworkSchema = createArtworkSchema.extend({
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  visibility: z.enum(['public', 'unlisted', 'private']).optional(),
  // null = back to draft; a future time schedules the publish
  publishedAt: z.union([z.string().datetime({ offset: true }), z.null()]).optional(),
  isMature: z.boolean().optional(),
  aiGenerated: z.boolean().optional(),
  viewerSettings: viewerSettingsSchema.nullable().optional(),
  modelRotation: modelRotationSchema.nullable().optional(),
  canvas: canvasSettingsSchema.optional(),
});

export const reorderArtworksSchema = z.object({
  artworkIds: z.array(z.string().min(1).max(64)).min(1).max(1000)
    .refine(ids => new Set(ids).size === ids.length, 'Artwork ids must be unique'),
});

export const createCollectionSchema = z.object({
  name: z.string().trim().min(1).max(255),
});

export const addCommentSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1).max(200),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
});

// An authenticator code ("123456") or a recovery code ("abcde-fghij").
const secondFactorCode = z.string().trim().min(6).max(32);

export const twoFactorLoginSchema = z.object({
  challengeToken: z.string().min(1).max(2048),
  code: secondFactorCode,
});

export const twoFactorEnableSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your app'),
});

export const twoFactorDisableSchema = z.object({
  password: z.string().min(1).max(200),
  code: secondFactorCode,
});

export const passwordConfirmSchema = z.object({
  password: z.string().min(1).max(200),
});

export const customDomainSchema = z.object({
  domain: z.string().trim().min(3).max(300),
});

export const verifyEmailSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/, 'Invalid confirmation link'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(255),
  newPassword: z.string().min(6).max(200),
});

export const reportSchema = z.object({
  targetType: z.enum(['artwork', 'comment', 'user', 'message']),
  // Artwork/comment/message id, or a username for users.
  targetId: z.string().trim().min(1).max(64),
  reason: z.enum([
    'spam', 'harassment', 'hate', 'unlabeled_mature', 'violence',
    'stolen_work', 'unlabeled_ai', 'impersonation', 'other',
  ]),
  details: z.string().trim().max(1000).optional(),
});

export const resolveReportSchema = z.object({
  action: z.enum(['dismiss', 'remove_content', 'suspend_user', 'remove_and_suspend']),
  note: z.string().trim().max(500).optional(),
});

export const suspendUserSchema = z.object({
  suspended: z.boolean().optional(),
  reason: z.string().trim().max(500).optional(),
});

export const setRoleSchema = z.object({
  role: z.enum(['user', 'admin']),
});

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

export const hireRequestSchema = z.object({
  projectTitle: z.string().trim().min(1).max(160),
  workType: z.enum(['freelance', 'full_time', 'contract', 'commissions']).optional(),
  budget: z.string().trim().max(80).optional(),
  timeline: z.string().trim().max(80).optional(),
  details: z.string().trim().min(1).max(5000),
});

// --- Jobs ---

const jobFields = {
  title: z.string().trim().min(1).max(160),
  company: z.string().trim().min(1).max(120),
  location: z.string().trim().max(120).optional(),
  workplace: z.enum(['onsite', 'hybrid', 'remote']),
  employmentType: z.enum(['full_time', 'part_time', 'contract', 'freelance', 'internship']),
  salary: z.string().trim().max(80).optional(),
  description: z.string().trim().min(1).max(10000),
  skills: z.array(z.string().trim().min(1).max(40)).max(15).optional(),
  applyUrl: z.union([profileUrl, z.literal('')]).optional(),
  expiresAt: z.union([z.string().datetime({ offset: true }), z.null()]).optional(),
};

export const createJobSchema = z.object(jobFields);
export const updateJobSchema = z.object(jobFields).partial().extend({ isOpen: z.boolean().optional() });
export const applyJobSchema = z.object({ message: z.string().trim().min(1).max(5000) });

// --- Marketplace ---

export const listingSchema = z.object({
  // 0 = free; capped at $100,000
  priceCents: z.number().int().min(0).max(10_000_000),
  currency: z.enum(['USD', 'EUR', 'GBP']).optional(),
  license: z.enum(['personal', 'commercial', 'editorial', 'cc_by', 'cc0']),
  description: z.string().trim().max(2000).optional(),
  isActive: z.boolean().optional(),
});

export const purchaseRequestSchema = z.object({ message: z.string().trim().max(2000).optional() });

