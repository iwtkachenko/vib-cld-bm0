import { Notifications } from '@mantine/notifications'
import { ModalsProvider } from '@mantine/modals'
import { createBrowserRouter, Navigate, Outlet } from 'react-router'
import { FullPageLoader, GuestOnly, HomeRedirect, RequireAuth } from './auth/guards'
import { AppLayout } from './layout/AppLayout'
import { TeamLayout } from './layout/TeamLayout'
import { InvitationsPage } from './pages/InvitationsPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { WelcomePage } from './pages/WelcomePage'
import { LoginPage } from './pages/auth/LoginPage'
import { RegisterPage } from './pages/auth/RegisterPage'
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage'
import { CardTypesPage } from './pages/cardTypes/CardTypesPage'
import { FlowEditorPage } from './pages/flows/FlowEditorPage'
import { FlowsPage } from './pages/flows/FlowsPage'
import { ProjectBoardPage } from './pages/projects/ProjectBoardPage'
import { ProjectLayout } from './pages/projects/ProjectLayout'
import { ProjectListPage } from './pages/projects/ProjectListPage'
import { ProjectSettingsPage } from './pages/projects/ProjectSettingsPage'
import { ProjectsPage } from './pages/projects/ProjectsPage'
import { TeamSettingsPage } from './pages/team/TeamSettingsPage'
import { TemplatesPage } from './pages/templates/TemplatesPage'

/** Modals/notifications live inside the router so their content can use router + query hooks. */
function Root() {
  return (
    <ModalsProvider>
      <Notifications position="top-right" />
      <Outlet />
    </ModalsProvider>
  )
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    HydrateFallback: FullPageLoader,
    children: [
      { path: '/', element: <HomeRedirect /> },
      {
        element: <GuestOnly />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
        ],
      },
      { path: '/verify-email', element: <VerifyEmailPage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: '/welcome', element: <WelcomePage /> },
          { path: '/invitations', element: <AppLayout><InvitationsPage /></AppLayout> },
          {
            path: '/t/:teamId',
            element: <TeamLayout />,
            children: [
              { index: true, element: <Navigate to="projects" replace /> },
              { path: 'projects', element: <ProjectsPage /> },
              {
                path: 'projects/:projectId',
                element: <ProjectLayout />,
                children: [
                  { index: true, element: <Navigate to="board" replace /> },
                  { path: 'board', element: <ProjectBoardPage /> },
                  { path: 'list', element: <ProjectListPage /> },
                  { path: 'stats', lazy: async () => ({ Component: (await import('./pages/projects/ProjectStatsPage')).ProjectStatsPage }) },
                  { path: 'settings', element: <ProjectSettingsPage /> },
                ],
              },
              { path: 'templates', element: <TemplatesPage /> },
              { path: 'card-types', element: <CardTypesPage /> },
              { path: 'flows', element: <FlowsPage /> },
              { path: 'flows/:flowId', element: <FlowEditorPage /> },
              { path: 'settings', element: <TeamSettingsPage /> },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
