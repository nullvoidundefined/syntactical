"""Strict pre-filter for drafted Python oracles.

Reads one program on stdin, parses it with ast.parse, and walks the whole tree. Only a
small grammar is allowed; anything else is refused. Prints one JSON line:
{"ok": true, "python": "<version>"} or {"ok": false, "reason": "...", "python": "<version>"}.
`--version` prints the interpreter version and `--banned` prints the refused names as JSON.

The Docker runner sandbox is the enforced control. This check only keeps drafted oracles
inside a grammar that has no route to imports, reflection, or string-built names, so a
refused question falls back to the judged path. Because it works on the AST, names are
checked as Python resolves them (NFKC-normalized, escapes decoded), not as text.

Attribute access on a module object is closed: each safe module lists the attributes an
oracle may use, and anything else (including a chain such as re.enum.bltns) is refused.
"""
import ast
import json
import sys

# Safe modules and the only attributes an oracle may reach on them. Every other
# `module.attr` and `from module import name` is refused, so a module can never be used to
# reach another module (enum.bltns, re.enum) or an unlisted helper.
SAFE_MODULE_ATTRIBUTES = {
    "bisect": "bisect bisect_left bisect_right insort insort_left insort_right",
    "collections": "ChainMap Counter OrderedDict defaultdict deque namedtuple",
    "copy": "copy deepcopy",
    "datetime": "MAXYEAR MINYEAR date datetime time timedelta timezone",
    "decimal": (
        "Context Decimal DivisionByZero Inexact InvalidOperation Overflow ROUND_05UP "
        "ROUND_CEILING ROUND_DOWN ROUND_FLOOR ROUND_HALF_DOWN ROUND_HALF_EVEN "
        "ROUND_HALF_UP ROUND_UP Rounded getcontext localcontext"
    ),
    "fractions": "Fraction",
    "functools": "cache cmp_to_key lru_cache partial reduce",
    "heapq": "heapify heappop heappush heappushpop heapreplace merge nlargest nsmallest",
    "itertools": (
        "accumulate batched chain combinations combinations_with_replacement compress count "
        "cycle dropwhile filterfalse groupby islice pairwise permutations product repeat "
        "starmap takewhile tee zip_longest"
    ),
    "json": "dumps loads",
    "math": (
        "acos asin atan atan2 cbrt ceil comb copysign cos cosh degrees dist e exp exp2 expm1 "
        "fabs factorial floor fmod frexp fsum gcd hypot inf isclose isfinite isinf isnan "
        "isqrt lcm ldexp log log10 log1p log2 modf nan perm pi pow prod radians remainder "
        "sin sinh sqrt tan tanh tau trunc"
    ),
    "operator": (
        "add and_ concat contains eq floordiv ge gt index itemgetter le lt mod mul ne neg "
        "not_ or_ pow sub truediv xor"
    ),
    "re": (
        "A ASCII DOTALL I IGNORECASE M MULTILINE Match Pattern S VERBOSE X compile error "
        "escape findall finditer fullmatch match search split sub subn"
    ),
    "statistics": (
        "fmean geometric_mean harmonic_mean mean median median_high median_low mode "
        "multimode pstdev pvariance quantiles stdev variance"
    ),
    "string": (
        "ascii_letters ascii_lowercase ascii_uppercase capwords digits hexdigits octdigits "
        "printable punctuation whitespace"
    ),
    "textwrap": "dedent fill indent shorten wrap",
}
SAFE_MODULES = {name: frozenset(attrs.split()) for name, attrs in SAFE_MODULE_ATTRIBUTES.items()}

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
# module names a safe module might re-export. Refused as bare names AND as attributes.
BANNED_NAMES = frozenset(
    {
        "exec", "eval", "compile", "open", "getattr", "setattr", "delattr", "hasattr", "vars",
        "globals", "locals", "dir", "breakpoint", "input", "help", "memoryview", "type",
        "object", "super", "classmethod", "staticmethod", "property", "exit", "quit",
        "license", "credits", "copyright", "bltns",
        "sys", "os", "posix", "nt", "subprocess", "builtins", "importlib", "types",
        "inspect", "io", "socket", "shutil", "pathlib", "ctypes", "threading",
        "multiprocessing", "signal", "gc", "code", "codecs", "pickle", "marshal", "tempfile",
        "glob", "platform",
    }
)
# More attribute names refused wherever they appear: format machinery, accessor builders,
# and the calls that reach a process.
EXTRA_BANNED_ATTRIBUTES = frozenset(
    {
        "format", "format_map", "Formatter", "attrgetter", "methodcaller", "get_type_hints",
        "ForwardRef", "evaluate_forward_ref", "system", "popen", "modules",
    }
)
BANNED_ATTRIBUTES = BANNED_NAMES | EXTRA_BANNED_ATTRIBUTES
BANNED_ATTRIBUTE_PREFIXES = ("_", "f_", "tb_", "gi_", "cr_", "ag_", "co_", "func_")


def refuse(reason):
    sys.stdout.write(json.dumps({"ok": False, "reason": reason, "python": sys.version.split()[0]}) + "\n")
    sys.exit(0)


def check_identifier(name, what):
    if name.startswith("_"):
        refuse("%s %s starts with an underscore" % (what, name))


def check_attribute(name):
    if name in BANNED_ATTRIBUTES or name.startswith(BANNED_ATTRIBUTE_PREFIXES):
        refuse("attribute %s" % name)


def check_module_attribute(module, name):
    """A name on a safe module: only the listed attributes, and never a private one."""
    check_identifier(name, "attribute")
    if name not in SAFE_MODULES[module]:
        refuse("%s.%s" % (module, name))


def check_import(node, module_names):
    if isinstance(node, ast.Import):
        for alias in node.names:
            if alias.name not in SAFE_MODULES:
                refuse("import %s" % alias.name)
            if alias.asname is not None:
                check_identifier(alias.asname, "import alias")
            module_names[alias.asname or alias.name] = alias.name
        return
    if node.level != 0 or node.module is None:
        refuse("relative import")
    if node.module not in SAFE_MODULES:
        refuse("import %s" % node.module)
    for alias in node.names:
        if alias.name == "*":
            refuse("star import")
        check_module_attribute(node.module, alias.name)
        if alias.asname is not None:
            check_identifier(alias.asname, "import alias")


def check_node(node, parents, module_names):
    kind = type(node).__name__
    if kind not in ALLOWED_NODE_NAMES and not isinstance(node, ALLOWED_NODE_BASES):
        refuse("syntax %s" % kind)
    if isinstance(node, ast.Name):
        check_identifier(node.id, "name")
        if node.id in BANNED_NAMES:
            refuse("name %s" % node.id)
        if node.id in module_names:
            parent = parents.get(node)
            if not (isinstance(parent, ast.Attribute) and parent.value is node and isinstance(node.ctx, ast.Load)):
                refuse("module %s used as a value" % node.id)
    elif isinstance(node, ast.Attribute):
        if isinstance(node.value, ast.Name) and node.value.id in module_names:
            check_module_attribute(module_names[node.value.id], node.attr)
        else:
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


def main():
    if "--version" in sys.argv:
        sys.stdout.write(sys.version.split()[0] + "\n")
        return
    if "--banned" in sys.argv:
        sys.stdout.write(json.dumps(sorted(BANNED_NAMES | BANNED_ATTRIBUTES)) + "\n")
        return
    source = sys.stdin.read()
    try:
        tree = ast.parse(source, mode="exec")
    except (SyntaxError, ValueError, RecursionError, MemoryError) as error:
        refuse("does not parse: %s" % type(error).__name__)
    parents = {}
    nodes = list(ast.walk(tree))
    for parent in nodes:
        for child in ast.iter_child_nodes(parent):
            parents[child] = parent
    # Imports first, so every later use of a module name is checked against its import.
    module_names = {}
    for node in nodes:
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            check_import(node, module_names)
    for node in nodes:
        check_node(node, parents, module_names)
    sys.stdout.write(json.dumps({"ok": True, "python": sys.version.split()[0]}) + "\n")


main()
