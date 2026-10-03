"""Strict pre-filter for drafted Python oracles.

Reads one program on stdin, parses it with ast.parse, and walks the whole tree. Only a
small grammar is allowed; anything else is refused. Prints one JSON line:
{"ok": true} or {"ok": false, "reason": "..."}.

The Docker runner sandbox is the enforced control. This check only keeps drafted oracles
inside a grammar that has no route to imports, reflection, or string-built names, so a
refused question falls back to the judged path. Because it works on the AST, names are
checked as Python resolves them (NFKC-normalized, escapes decoded), not as text.
"""
import ast
import json
import sys

SAFE_MODULES = frozenset(
    {
        "bisect",
        "collections",
        "copy",
        "dataclasses",
        "datetime",
        "decimal",
        "enum",
        "fractions",
        "functools",
        "heapq",
        "itertools",
        "json",
        "math",
        "operator",
        "re",
        "statistics",
        "string",
        "textwrap",
        "typing",
    }
)
# The one dotted import allowed; every other submodule path is refused.
SAFE_DOTTED_MODULES = frozenset({"collections.abc"})

ALLOWED_NODE_NAMES = frozenset(
    {
        "Module", "Expr", "Assign", "AugAssign", "AnnAssign", "Name", "Constant", "BinOp",
        "UnaryOp", "BoolOp", "Compare", "IfExp", "Call", "Attribute", "Subscript", "Slice",
        "List", "Tuple", "Dict", "Set", "ListComp", "SetComp", "DictComp", "GeneratorExp",
        "comprehension", "For", "While", "If", "Break", "Continue", "Pass", "FunctionDef",
        "Lambda", "arguments", "arg", "Return", "Try", "ExceptHandler", "Raise", "Assert",
        "JoinedStr", "FormattedValue", "keyword", "Starred", "Import", "ImportFrom", "alias",
    }
)
# Context, operator, and comparison nodes are plain data and always allowed.
ALLOWED_NODE_BASES = (ast.expr_context, ast.operator, ast.unaryop, ast.boolop, ast.cmpop)

# Builtins that reach reflection, code execution, files, or the interpreter, and the
# module names a safe module might re-export. Refused as bare names.
BANNED_NAMES = frozenset(
    {
        "exec", "eval", "compile", "open", "getattr", "setattr", "delattr", "hasattr", "vars",
        "globals", "locals", "dir", "breakpoint", "input", "help", "memoryview", "type",
        "object", "super", "classmethod", "staticmethod", "property", "exit", "quit",
        "license", "credits", "copyright",
        "sys", "os", "posix", "nt", "subprocess", "builtins", "importlib", "types",
        "inspect", "io", "socket", "shutil", "pathlib", "ctypes", "threading",
        "multiprocessing", "signal", "gc", "code", "codecs", "pickle", "marshal", "tempfile",
        "glob", "platform",
    }
)
# Attribute names refused wherever they appear: format machinery, frame and code
# objects, accessor builders, and module names (typing.sys, dataclasses.inspect, ...).
BANNED_ATTRIBUTES = frozenset(
    {
        "format", "format_map", "Formatter", "attrgetter", "methodcaller", "get_type_hints",
        "ForwardRef", "evaluate_forward_ref", "exec", "eval", "open", "breakpoint", "getattr",
        "setattr", "delattr", "vars", "globals", "locals", "system", "popen", "modules",
        "sys", "os", "posix", "nt", "subprocess", "builtins", "importlib", "types",
        "inspect", "io", "socket", "shutil", "pathlib", "ctypes", "threading",
        "multiprocessing", "signal", "gc", "code", "codecs", "pickle", "marshal", "tempfile",
        "glob", "platform",
    }
)
BANNED_ATTRIBUTE_PREFIXES = ("_", "f_", "tb_", "gi_", "cr_", "ag_", "co_", "func_")


def refuse(reason):
    print(json.dumps({"ok": False, "reason": reason}))
    sys.exit(0)


def check_identifier(name, what):
    if name.startswith("_"):
        refuse("%s %s starts with an underscore" % (what, name))


def check_attribute(name):
    if name in BANNED_ATTRIBUTES or name.startswith(BANNED_ATTRIBUTE_PREFIXES):
        refuse("attribute %s" % name)


def check_import(node):
    if isinstance(node, ast.Import):
        modules = [alias.name for alias in node.names]
    else:
        if node.level != 0 or node.module is None:
            refuse("relative import")
        modules = [node.module]
        for alias in node.names:
            if alias.name == "*":
                refuse("star import")
            check_identifier(alias.name, "imported name")
            check_attribute(alias.name)
    for alias in node.names:
        if alias.asname is not None:
            check_identifier(alias.asname, "import alias")
    for module in modules:
        parts = module.split(".")
        if any(part.startswith("_") for part in parts):
            refuse("import %s" % module)
        if len(parts) > 1:
            if module not in SAFE_DOTTED_MODULES:
                refuse("import %s" % module)
        elif module not in SAFE_MODULES:
            refuse("import %s" % module)


def check_node(node):
    kind = type(node).__name__
    if kind not in ALLOWED_NODE_NAMES and not isinstance(node, ALLOWED_NODE_BASES):
        refuse("syntax %s" % kind)
    if isinstance(node, ast.Name):
        check_identifier(node.id, "name")
        if node.id in BANNED_NAMES:
            refuse("name %s" % node.id)
    elif isinstance(node, ast.Attribute):
        check_attribute(node.attr)
    elif isinstance(node, ast.keyword):
        if node.arg is not None:
            check_identifier(node.arg, "keyword")
    elif isinstance(node, ast.arg):
        check_identifier(node.arg, "argument")
    elif isinstance(node, ast.FunctionDef):
        check_identifier(node.name, "function")
        if node.decorator_list or getattr(node, "type_params", None):
            refuse("decorator or type parameter")
    elif isinstance(node, ast.ExceptHandler):
        if node.name is not None:
            check_identifier(node.name, "exception name")
    elif isinstance(node, (ast.Import, ast.ImportFrom)):
        check_import(node)


def main():
    source = sys.stdin.read()
    try:
        tree = ast.parse(source, mode="exec")
    except (SyntaxError, ValueError, RecursionError, MemoryError) as error:
        refuse("does not parse: %s" % type(error).__name__)
    for node in ast.walk(tree):
        check_node(node)
    print(json.dumps({"ok": True}))


main()
