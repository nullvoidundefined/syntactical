// The visible label above a text input. On web it is a real <label for>, so a click focuses the
// input and the pairing is exposed to assistive technology; react-native-web's Text cannot render
// a <label>, so the DOM element is created directly (the AuthButton pattern). Native keeps a Text.
import { createElement } from 'react';
import { Platform, Text } from 'react-native';

type FieldLabelProps = {
  className?: string;
  inputId: string;
  text: string;
};

const LABEL_CLASS = 'font-mono text-sm text-ink';

export function FieldLabel({ className = '', inputId, text }: FieldLabelProps) {
  const classes = `${LABEL_CLASS} ${className}`.trim();
  if (Platform.OS === 'web') return createElement('label', { className: classes, htmlFor: inputId }, text);
  return <Text className={classes}>{text}</Text>;
}
