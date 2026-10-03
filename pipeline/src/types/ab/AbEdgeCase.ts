// One edge case a correctness A/B card is checked against. `call` is appended to an
// option's code and prints the result; `expected` is what a correct option prints for it;
// `input` is the short label the failing-case evidence names.
export interface AbEdgeCase {
    call: string;
    expected: string;
    input: string;
}
