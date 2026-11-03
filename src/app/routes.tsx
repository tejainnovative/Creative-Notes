import { createHashRouter } from 'react-router';
import { AppShell } from './AppShell';
import { DesignPage } from '../routes/DesignPage';
import { Stub } from '../screens/Stub';
import { Home } from '../screens/Home';
import { Welcome } from '../screens/Welcome';
import { Record } from '../screens/Record';
import { Meeting } from '../screens/Meeting';
import { History } from '../screens/History';
import { Install } from '../screens/Install';
import { Ask } from '../screens/Ask';
import { Settings } from '../screens/Settings';
import { MicHelp } from '../screens/MicHelp';
import { Unsupported } from '../screens/Unsupported';
import { QuickNote } from '../screens/QuickNote';
import { OfflineSetup } from '../screens/OfflineSetup';
import { Tasks } from '../screens/Tasks';

// Hash routes keep everything after # (including quick-note text) out of server logs.
// Screen IDs (S01-S15) are shared by the code, tests and screenshots.
export const router = createHashRouter([
  { path: '/design', element: <DesignPage /> },
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/welcome', element: <Welcome /> },
      { path: '/record', element: <Record /> },
      { path: '/m/:id', element: <Meeting /> },
      { path: '/m/:id/score', element: <Stub id="S05" title="Meeting score" back /> },
      { path: '/history', element: <History /> },
      { path: '/tasks', element: <Tasks /> },
      { path: '/ask', element: <Ask /> },
      { path: '/settings', element: <Settings /> },
      { path: '/mic-help', element: <MicHelp /> },
      { path: '/unsupported', element: <Unsupported /> },
      { path: '/quick', element: <QuickNote /> },
      { path: '/settings/offline', element: <OfflineSetup /> },
      { path: '/install', element: <Install /> },
      { path: '/unlock', element: <Stub id="S15" title="Unlock" /> },
      { path: '*', element: <Stub id="404" title="Page not found" back /> },
    ],
  },
]);
