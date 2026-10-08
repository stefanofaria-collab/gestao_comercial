export type UserRole = "gerencial" | "analista";

export type AuthUser = {
  email: string;
  name: string;
  role: UserRole;
  pages?: string[];
  must_define_password?: boolean;
  active?: boolean;
};

export type AuthSession = {
  token: string;
  user: AuthUser;
};

export type ManagedUser = AuthUser;

export type PageOption = {
  path: string;
  label: string;
};
