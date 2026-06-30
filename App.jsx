import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Box } from '@mui/material';
import Masthead from './components/Masthead';
import AllNotificationsPage from './pages/AllNotificationsPage';
import PriorityInboxPage from './pages/PriorityInboxPage';
import { tokens } from './theme/theme';

export default function App() {
  return (
    <BrowserRouter>
      <Box sx={{ minHeight: '100vh', backgroundColor: tokens.paper }}>
        <Masthead />
        <Routes>
          <Route path="/" element={<AllNotificationsPage />} />
          <Route path="/priority" element={<PriorityInboxPage />} />
        </Routes>
      </Box>
    </BrowserRouter>
  );
}
