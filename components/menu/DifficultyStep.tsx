// Step 2 of the launch flow: the difficulties the chosen language's
// manifest entry names, labeled from the app's registry, each showing
// whether its bank is ready, downloading, failed, locked (a paid bank without
// its entitlement), or needs a connection (no local copy while offline).
import { DIFFICULTIES } from '@syntactical/content-schema';
import { Pressable, Text, View } from 'react-native';

import { useIsOnline } from '../../state/useIsOnline';
import { useKeyboardNav } from '../../state/useKeyboardNav';
import { useLanguageManifest } from '../../state/useLanguageManifest';
import { useQuestionBank, type QuestionBankState } from '../../state/useQuestionBank';

import { SelectionCard } from './SelectionCard';

type DifficultyOptionProps = {
  difficultyId: string;
  keyHint: number;
  language: string;
  onSelect: () => void;
  onSelectLocked: () => void;
  price: string | undefined;
};
type DifficultyStepProps = {
  language: string;
  onBack: () => void;
  onSelectDifficulty: (difficultyId: string) => void;
  // Called when a locked paid bank is selected; without it a locked bank stays inert.
  onSelectLockedDifficulty?: (difficultyId: string) => void;
  // Localized store prices by product id.
  prices?: Readonly<Record<string, string>>;
};

function describeBankStatus(bankState: QuestionBankState, isOnline: boolean): string | undefined {
  if (bankState.status === 'ready') return undefined;
  if (bankState.status === 'locked') return 'Locked';
  if (!isOnline) return 'Needs a connection to load';
  if (bankState.status === 'error') return 'Download failed. Tap to retry';
  return 'Downloading';
}

function readDifficultyCopy(difficultyId: string) {
  return (
    DIFFICULTIES.find(({ id }) => id === difficultyId) ?? {
      description: '',
      label: difficultyId,
    }
  );
}

function pickSelectHandler(bankState: QuestionBankState, onSelect: () => void, onSelectLocked: () => void): () => void {
  if (bankState.status === 'locked') return onSelectLocked;
  return 'retry' in bankState ? bankState.retry : onSelect;
}

// "<Label>, locked, <price>"; no price when the store has not given one.
function describeLockedBank(label: string, price: string | undefined): string {
  return price === undefined ? `${label}, locked` : `${label}, locked, ${price}`;
}

function readPrice(
  languageEntry: { banks: Record<string, { productId?: string } | undefined> } | undefined,
  difficultyId: string,
  prices: Readonly<Record<string, string>>,
): string | undefined {
  const productId = languageEntry?.banks[difficultyId]?.productId;
  return productId === undefined ? undefined : prices[productId];
}

function DifficultyOption({ difficultyId, keyHint, language, onSelect, onSelectLocked, price }: DifficultyOptionProps) {
  const bankState = useQuestionBank(language, difficultyId);
  const isOnline = useIsOnline();
  const { description, label } = readDifficultyCopy(difficultyId);
  const { status } = bankState;
  const isRetryable = status === 'error' && isOnline;
  const isLocked = status === 'locked';
  const isDisabled = status !== 'ready' && !isRetryable && !isLocked;
  const handleSelect = pickSelectHandler(bankState, onSelect, onSelectLocked);
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
      ariaLabel={isLocked ? describeLockedBank(label, price) : undefined}
      isDisabled={isDisabled}
      statusLabel={describeBankStatus(bankState, isOnline)}
    />
  );
}

export function DifficultyStep({
  language,
  onBack,
  onSelectDifficulty,
  onSelectLockedDifficulty,
  prices = {},
}: DifficultyStepProps) {
  const { languages } = useLanguageManifest();
  const languageEntry = languages.find(({ id }) => id === language);
  const difficultyIds = DIFFICULTIES.map(({ id }) => id).filter(
    (id) => languageEntry && Object.hasOwn(languageEntry.banks, id),
  );
  useKeyboardNav({ onEscape: onBack });
  return (
    <View>
      <View className="mb-4 flex-row items-center justify-between">
        <Text role="heading" aria-level={1} className="font-mono text-xs uppercase tracking-widest text-muted">
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
            onSelectLocked={() => onSelectLockedDifficulty?.(difficultyId)}
            price={readPrice(languageEntry, difficultyId, prices)}
          />
        ))}
      </View>
    </View>
  );
}
