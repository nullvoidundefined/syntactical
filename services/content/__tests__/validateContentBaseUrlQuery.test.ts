import { validateContentBaseUrl } from '../validateContentBaseUrl';

describe('validateContentBaseUrl query and fragment', () => {
  it.each([
    'https://nullvoidundefined.github.io/syntactical/content/?x=1',
    'https://nullvoidundefined.github.io/syntactical/content/#y',
    'https://nullvoidundefined.github.io/syntactical/preview/content/?x=1#y',
    'https://nullvoidundefined.github.io/syntactical/content/?',
  ])('refuses %p', (value) => {
    expect(validateContentBaseUrl(value)).toBeNull();
  });
});
