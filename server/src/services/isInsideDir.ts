// True when child is the parent directory or lies inside it. A child named "..private" is
// inside; only ".." itself or ".." followed by a separator leaves the parent.
import { isAbsolute, relative, sep } from 'node:path';

function isInsideDir(parent: string, child: string): boolean {
  const fromParent = relative(parent, child);
  const isOutside =
    fromParent === '..' || fromParent.startsWith(`..${sep}`) || isAbsolute(fromParent);
  return !isOutside;
}

export { isInsideDir };
