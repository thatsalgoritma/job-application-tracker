import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  request,
  TOKEN_STORAGE_KEY,
  UNAUTHORIZED_EVENT,
} from '../api/http-client';
import type { AuthContextValue, AuthResponse, User } from './auth-types';

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    setUser(null);
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);

    const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) {
      setIsLoading(false);
      return () =>
        window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    }

    void request<User>('/me')
      .then(setUser)
      .catch(() => {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
        setUser(null);
      })
      .finally(() => setIsLoading(false));

    return () =>
      window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, []);

  const authenticate = useCallback(
    async (path: '/auth/login' | '/auth/register', email: string, password: string) => {
      const result = await request<AuthResponse>(path, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      window.localStorage.setItem(TOKEN_STORAGE_KEY, result.accessToken);
      setUser(result.user);
    },
    [],
  );

  const login = useCallback(
    (email: string, password: string) =>
      authenticate('/auth/login', email, password),
    [authenticate],
  );
  const register = useCallback(
    (email: string, password: string) =>
      authenticate('/auth/register', email, password),
    [authenticate],
  );

  const value = useMemo(
    () => ({ user, isLoading, login, register, logout }),
    [user, isLoading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
