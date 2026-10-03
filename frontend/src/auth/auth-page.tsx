import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/http-client';
import { useAuth } from './auth-context';

interface AuthPageProps {
  mode: 'login' | 'register';
}

export function AuthPage({ mode }: AuthPageProps) {
  const isRegister = mode === 'register';
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (isRegister) {
        await register(email, password);
      } else {
        await login(email, password);
      }
      navigate('/applications', { replace: true });
    } catch (submissionError) {
      setError(
        submissionError instanceof ApiError
          ? submissionError.message
          : 'We could not reach the server. Check your connection and try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-layout">
      <aside className="auth-intro" aria-label="About Job Application Tracker">
        <div className="brand-mark" aria-hidden="true">JT</div>
        <p className="eyebrow">A clearer job search</p>
        <h1>Keep every application in view.</h1>
        <p className="intro-copy">
          Track progress, prepare for interviews, and remember when to follow up.
        </p>
        <div className="intro-rule" />
        <p className="intro-footnote">Your job search, organized in one place.</p>
      </aside>

      <section className="auth-panel" aria-labelledby="auth-heading">
        <div className="auth-card">
          <p className="eyebrow">Job Application Tracker</p>
          <h2 id="auth-heading">{isRegister ? 'Create your account' : 'Welcome back'}</h2>
          <p className="auth-subtitle">
            {isRegister
              ? 'Create an account to start tracking your applications.'
              : 'Sign in to continue to your applications.'}
          </p>

          <form onSubmit={handleSubmit} className="auth-form">
            <label htmlFor="email">Email address</label>
            <input
              autoComplete="email"
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />

            <label htmlFor="password">Password</label>
            <input
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              placeholder="At least 8 characters"
              required
            />
            {isRegister && (
              <p className="field-hint">Use 8 or more characters. Passwords over 72 UTF-8 bytes are rejected.</p>
            )}

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <button className="submit-button" type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? 'Please wait…'
                : isRegister
                  ? 'Create account'
                  : 'Sign in'}
            </button>
          </form>

          <p className="auth-switch">
            {isRegister ? 'Already have an account?' : 'New to the tracker?'}{' '}
            <Link to={isRegister ? '/login' : '/register'}>
              {isRegister ? 'Sign in' : 'Create an account'}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
