import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/http-client';
import { AuthContext } from './auth-context';
import type { AuthContextValue } from './auth-types';
import { AuthPage } from './auth-page';
import { ProtectedRoute } from './protected-route';

function renderAuthRoute(
  path: '/login' | '/register',
  auth: AuthContextValue,
) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/applications" element={<p>Applications area</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

function authValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: null,
    isLoading: false,
    login: vi.fn().mockResolvedValue(undefined),
    register: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
    ...overrides,
  };
}

describe('authentication pages', () => {
  it('submits login and continues to the protected area', async () => {
    const auth = authValue();
    renderAuthRoute('/login', auth);

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'person@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'correct-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await screen.findByText('Applications area');
    expect(auth.login).toHaveBeenCalledWith(
      'person@example.com',
      'correct-password',
    );
  });

  it('shows backend validation errors on registration', async () => {
    const register = vi
      .fn()
      .mockRejectedValue(new ApiError('An account with this email already exists', 409));
    renderAuthRoute('/register', authValue({ register }));

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'person@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'correct-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An account with this email already exists',
    );
  });

  it('sends an unauthenticated visitor to login', async () => {
    render(
      <AuthContext.Provider value={authValue()}>
        <MemoryRouter initialEntries={['/applications']}>
          <Routes>
            <Route
              path="/applications"
              element={
                <ProtectedRoute>
                  <p>Private applications</p>
                </ProtectedRoute>
              }
            />
            <Route path="/login" element={<p>Sign-in page</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    await waitFor(() => expect(screen.getByText('Sign-in page')).toBeInTheDocument());
    expect(screen.queryByText('Private applications')).not.toBeInTheDocument();
  });
});
