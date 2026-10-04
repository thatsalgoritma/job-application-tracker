import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthPage } from './auth/auth-page';
import { ProtectedRoute } from './auth/protected-route';
import { ApplicationsBoard } from './applications/applications-board';
import { ApplicationDetailPage } from './interviews/application-detail-page';
import { InsightsPage } from './statistics/insights-page';
import { SettingsPage } from './users/settings-page';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route
        path="/applications"
        element={
          <ProtectedRoute>
            <ApplicationsBoard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/applications/:applicationId"
        element={
          <ProtectedRoute>
            <ApplicationDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/insights"
        element={
          <ProtectedRoute>
            <InsightsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={<ProtectedRoute><SettingsPage /></ProtectedRoute>}
      />
      <Route path="*" element={<Navigate to="/applications" replace />} />
    </Routes>
  );
}
