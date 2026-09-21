export interface User {
  id: string;
  email: string;
  username: string;
  name?: string;
  avatarUrl?: string | null;
  title?: string | null;
  bio?: string | null;
  location?: string | null;
  github?: string | null;
  linkedin?: string | null;
  skills?: string[];
}
