// Step 2 of the launch flow: the difficulties the chosen language's
// manifest entry names, labeled from the app's registry, each showing
// whether its bank is ready, downloading, failed, or needs a connection.
import { Pressable, Text, View } from 'react-native';

import { DIFFICULTIES } from '../../constants/appConfig';
import { useIsOnline } from '../../state/useIsOnline';
import { useKeyboardNav } from '../../state/useKeyboardNav';
import { useLanguageManifest } from '../../state/useLanguageManifest';
import { useQuestionBank, type QuestionBankState } from '../../state/useQuestionBank';

import { SelectionCard } from './SelectionCard';

type DifficultyOptionProps = { difficultyId: string; keyHint: number; language: string; onSelect: () => void };
type DifficultyStepProps = { language: string; onBack: () => void; onSelectDifficulty: (difficultyId: string) => void };

function describeBankStatus(bankState: QuestionBankState, isOnline: boolean): string | undefined {
  if (bankState.status === 'ready') return undefined;
  if (!isOnline) return 'Needs a connection to load';
  if (bankState.status === 'error') return 'Download failed. Tap to retry';
  return 'Downloading';
}

function readDifficultyCopy(difficultyId: string) {
  return DIFFICULTIES.find(({ id }) => id === difficultyId) ?? { description: '', label: difficultyId };
}

function pickSelectHandler(bankState: QuestionBankState, onSelect: () => void): () => void {
  return 'retry' in bankState ? bankState.retry : onSelect;
}

function DifficultyOption({ difficultyId, keyHint, language, onSelect }: DifficultyOptionProps) {
  const bankState = useQuestionBank(language, difficultyId);
  const isOnline = useIsOnline();
  const { description, label } = readDifficultyCopy(difficultyId);
  const { status } = bankState;
  const isRetryable = status === 'error' && isOnline;
  const isDisabled = status !== 'ready' && !isRetryable;
  const handleSelect = pickSelectHandler(bankState, onSelect);
  useKeyboardNav({
    onSelectChoice: (index) => {
      if (index === keyHint - 1 && !isDisabled) handleSelect();
    },
  });
  return (
    <SelectionCard
      keyHint={keyHint}
      title={label}
      subtitle={description}
      onSelect={handleSelect}
      isDisabled={isDisabled}
      statusLabel={describeBankStatus(bankState, isOnline)}
    />
  );
}

export function DifficultyStep({ language, onBack, onSelectDifficulty }: DifficultyStepProps) {
  const { languages } = useLanguageManifest();
  const languageEntry = languages.find(({ id }) => id === language);
  const difficultyIds = DIFFICULTIES.map(({ id }) => id).filter((id) => languageEntry && Object.hasOwn(languageEntry.banks, id));
  useKeyboardNav({ onEscape: onBack });
  return (
    <View>
      <View className="mb-4 flex-row items-center justify-between">
        <Text className="font-mono text-xs uppercase tracking-widest text-muted">
          Step 2 / Select difficulty <Text className="text-signal">{languageEntry?.label ?? language}</Text>
        </Text>
        <Pressable role="button" aria-label="Back" onPress={onBack}>
          <Text className="font-mono text-xs text-muted">Back</Text>
        </Pressable>
      </View>
      <View className="gap-3">
        {difficultyIds.map((difficultyId, index) => (
          <DifficultyOption
            key={difficultyId}
            difficultyId={difficultyId}
            keyHint={index + 1}
            language={language}
            onSelect={() => onSelectDifficulty(difficultyId)}
          />
        ))}
      </View>
    </View>
  );
}
