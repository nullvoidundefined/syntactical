import type { Grammar } from '../../../constants/appConfig';
import { tokenizeCode } from '../tokenizeCode';

const CODE = '<div class="a">x</div> a { color: red; } const x = 1;';

describe('tokenizeCode grammar allowlist', () => {
    it.each(['markup', 'css', 'clike', 'js'])(
        'returns one plain unhighlighted piece for %s, a Prism key the build GRAMMARS list does not include',
        (grammar) => {
            expect(tokenizeCode(CODE, grammar as Grammar)).toEqual([{ text: CODE, types: [] }]);
        },
    );
});
