import { createRoot } from 'react-dom/client';
import '@mantine/core/styles.css';
import './index.css';
import App from './App.tsx';
import { MantineProvider, createTheme } from '@mantine/core';

const theme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'md',
  respectReducedMotion: true,
});

createRoot(document.getElementById('root')!).render(
  <MantineProvider theme={theme} defaultColorScheme="dark">
    <App />
  </MantineProvider>
);
