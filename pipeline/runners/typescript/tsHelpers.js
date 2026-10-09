const ts = require('typescript');
const path = require('node:path');

function compileSnippet(source) {
    const fileName = '/snippet.ts';
    const options = {
        strict: true,
        noEmit: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        types: [],
    };
    const host = ts.createCompilerHost(options);
    const readFile = host.readFile.bind(host);
    const libDirectory = path.dirname(ts.getDefaultLibFilePath(options));
    const isLibrary = (file) => path.dirname(file) === libDirectory && /^lib\..*\.d\.ts$/.test(path.basename(file));
    host.readFile = (file) => (file === fileName ? source : isLibrary(file) ? readFile(file) : undefined);
    host.fileExists = (file) => host.readFile(file) !== undefined;
    host.getSourceFile = (file, languageVersion) => {
        const text = host.readFile(file);
        return text === undefined ? undefined : ts.createSourceFile(file, text, languageVersion, true);
    };
    const program = ts.createProgram([fileName], options, host);
    return { program, sourceFile: program.getSourceFile(fileName) };
}

function countTypeErrors(source) {
    const { program } = compileSnippet(source);
    return program.getSyntacticDiagnostics().length + program.getSemanticDiagnostics().length;
}

function typeOf(source, name) {
    const { program, sourceFile } = compileSnippet(source);
    const checker = program.getTypeChecker();
    for (const statement of sourceFile.statements) {
        const declarations = ts.isVariableStatement(statement) ? statement.declarationList.declarations : [statement];
        for (const declaration of declarations) {
            if (declaration.name && ts.isIdentifier(declaration.name) && declaration.name.text === name) {
                return checker.typeToString(checker.getTypeAtLocation(declaration.name));
            }
        }
    }
    throw new Error(`No top-level declaration named ${name}`);
}

module.exports = { countTypeErrors, typeOf };
