import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { LanguageProvider } from './i18n/translations.ts';
import { SpeechProvider } from './utils/speechContext.tsx';
import './index.css';

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <ErrorBoundary>
      <LanguageProvider>
        <SpeechProvider>
          <App />
        </SpeechProvider>
      </LanguageProvider>
    </ErrorBoundary>,
  );
}
