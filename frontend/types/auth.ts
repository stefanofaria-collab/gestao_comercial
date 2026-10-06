export type UserRole = "gerencial" | "analista";

export type AuthUser = {
  email: string;
  name: string;
  role: UserRole;
  must_define_password?: boolean;
};

export type AuthSession = {
  token: string;
  user: AuthUser;
};
