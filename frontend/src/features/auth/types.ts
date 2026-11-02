export type Role = 'OWNER' | 'CASHIER' | 'WAITER';

export interface UserProfile {
  id: string;
  username: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface LoginResponse {
  access_token: string;
  csrf_token: string;
  token_type: string;
  expires_in: number;
  user: UserProfile;
}
