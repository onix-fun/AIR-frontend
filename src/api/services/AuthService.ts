import { ACCESS_TOKEN_KEY, profileClient } from "@/api/client";
import type { AuthSession, User } from "@/domain";

interface LoginResponse {
  accessToken: string;
  userId: string;
  user: UserResponse;
}

interface UserResponse {
  id: string;
  email: string;
  username: string;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  emailVerified?: boolean;
  role?: string;
  status?: string;
}

export interface RegistrationStartedResponse {
  email: string;
  expiresInSeconds: number;
  message: string;
}

interface RegisterPayload {
  email: string;
  username: string;
  password: string;
}

interface LoginPayload {
  identifier: string;
  password: string;
}

interface UpdateProfilePayload {
  email?: string;
  firstName?: string;
  lastName?: string;
  bio?: string;
}

const USER_KEY = "sparrow.profile.user";

function normalizeUser(user: UserResponse): User {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    emailVerified: user.emailVerified,
    role: user.role,
  };
}

export interface UserPublicDto {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
}

export class AuthService {
  static async searchUsers(query: string): Promise<UserPublicDto[]> {
    const response = await profileClient.get<UserPublicDto[]>("/search/search", { params: { q: query } });
    return response.data;
  }

  static getStoredSession(): User | null {
    const stored = window.localStorage.getItem(USER_KEY);
    const token = window.localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!stored || !token) return null;
    try {
      return JSON.parse(stored) as User;
    } catch {
      this.clearLocalSession();
      return null;
    }
  }

  static getAccessToken(): string | null {
    return window.localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  static async login(payload: LoginPayload): Promise<User> {
    const response = await profileClient.post<LoginResponse>("/auth/login", {
      ...payload,
      deviceId: window.navigator.userAgent,
    });
    const user = normalizeUser(response.data.user);
    this.persist(response.data.accessToken, user);
    return user;
  }

  static async register(payload: RegisterPayload): Promise<RegistrationStartedResponse> {
    const response = await profileClient.post<RegistrationStartedResponse>("/auth/register", payload);
    return response.data;
  }

  static async confirmRegistration(email: string, code: string): Promise<User> {
    const response = await profileClient.post<LoginResponse>("/auth/confirm-registration", {
      email,
      code,
      deviceId: window.navigator.userAgent,
    });
    const user = normalizeUser(response.data.user);
    this.persist(response.data.accessToken, user);
    return user;
  }

  static async resendRegistrationCode(email: string): Promise<RegistrationStartedResponse> {
    const response = await profileClient.post<RegistrationStartedResponse>("/auth/resend-registration-code", { email });
    return response.data;
  }

  static async refresh(): Promise<User | null> {
    try {
      const response = await profileClient.post<{ accessToken: string }>("/auth/refresh");
      window.localStorage.setItem(ACCESS_TOKEN_KEY, response.data.accessToken);
      const user = await this.getMe();
      this.persist(response.data.accessToken, user);
      return user;
    } catch {
      this.clearLocalSession();
      return null;
    }
  }

  static async getMe(): Promise<User> {
    const response = await profileClient.get<User>("/users/me");
    const user = response.data;
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
  }

  static async updateProfile(payload: UpdateProfilePayload): Promise<User> {
    const response = await profileClient.patch<User>("/users/me", payload);
    window.localStorage.setItem(USER_KEY, JSON.stringify(response.data));
    return response.data;
  }

  static async uploadAvatar(file: File): Promise<User> {
    const form = new FormData();
    form.append("file", file);
    const response = await profileClient.post<User>("/users/me/avatar", form);
    window.localStorage.setItem(USER_KEY, JSON.stringify(response.data));
    return response.data;
  }

  static async verifyEmail(code: string): Promise<void> {
    await profileClient.post("/auth/verify-email", { code });
  }

  static async resendVerification(): Promise<void> {
    await profileClient.post("/auth/resend-verification");
  }

  static async forgotPassword(identifier: string): Promise<void> {
    await profileClient.post("/auth/forgot-password", { identifier });
  }

  static async resetPassword(identifier: string, code: string, newPassword: string): Promise<void> {
    await profileClient.post("/auth/reset-password", { identifier, code, newPassword });
  }

  static async logout(): Promise<void> {
    try {
      await profileClient.post("/auth/logout");
    } finally {
      this.clearLocalSession();
    }
  }

  static async logoutAll(): Promise<void> {
    try {
      await profileClient.post("/auth/logout-all");
    } finally {
      this.clearLocalSession();
    }
  }

  static async getSessions(): Promise<AuthSession[]> {
    const response = await profileClient.get<AuthSession[]>("/sessions");
    return response.data;
  }

  static async revokeSession(id: string): Promise<void> {
    await profileClient.delete(`/sessions/${id}`);
  }

  private static persist(accessToken: string, user: User) {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  private static clearLocalSession() {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
    window.localStorage.removeItem("sparrow.mock.session");
  }
}
