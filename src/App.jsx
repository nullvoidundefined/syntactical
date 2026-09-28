// Top-level view router: menu (language + difficulty selection) or an
// active quiz round. Owns the current track selection; stats persistence
// is delegated to useQuizStats.

import { useState } from 'react';
import { AppShell } from './components/layout/AppShell.jsx';
import { MainMenu } from './components/menu/MainMenu.jsx';
import { QuizView } from './components/quiz/QuizView.jsx';
import { useQuizStats } from './hooks/useQuizStats.js';

export default function App() {
  const [selection, setSelection] = useState(null);
  const { stats, recordAnswer, recordCompletion } = useQuizStats();

  return (
    <AppShell streak={stats.streak}>
      {selection ? (
        <QuizView
          language={selection.language}
          difficulty={selection.difficulty}
          recordAnswer={recordAnswer}
          recordCompletion={recordCompletion}
          onExit={() => setSelection(null)}
        />
      ) : (
        <MainMenu stats={stats} onLaunch={setSelection} />
      )}
    </AppShell>
  );
}
