// The mono family must name a font each platform actually has: native
// builds load no custom fonts, so 'JetBrains Mono' would fall back to the
// proportional system sans and misalign code samples.
function loadMonoFamily(nativewindOs: string | undefined): unknown {
  const previous = process.env.NATIVEWIND_OS;
  if (nativewindOs === undefined) delete process.env.NATIVEWIND_OS;
  else process.env.NATIVEWIND_OS = nativewindOs;
  try {
    let mono: unknown;
    jest.isolateModules(() => {
      mono = require('../../tailwind.config.js').theme.extend.fontFamily.mono;
    });
    return mono;
  } finally {
    if (previous === undefined) delete process.env.NATIVEWIND_OS;
    else process.env.NATIVEWIND_OS = previous;
  }
}

describe('tailwind mono font family', () => {
  it.each(['ios', 'android'])('selects a system monospace font on native builds (%s)', (os) => {
    const mono = String(loadMonoFamily(os));
    expect(mono).toContain('ios/Menlo');
    expect(mono).toContain('android/monospace');
    expect(mono).not.toContain('JetBrains Mono');
  });

  it.each([undefined, 'web'])('keeps the full monospace stack on the web (NATIVEWIND_OS %p)', (os) => {
    expect(loadMonoFamily(os)).toEqual(['JetBrains Mono', 'ui-monospace', 'Menlo', 'monospace']);
  });
});
