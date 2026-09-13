# Existing profile links survive the first repair

The first VSIX normalized the CLI path, but did not repair existing links under
DSH_HOME/profiles/node_modules. DSH's ensureSymlink compares canonical filesystem
targets and retains a junction whose spelling differs only in drive-letter case.
Consequently, restarting with an uppercase CLI path still loaded file-upload
through a lowercase file URL. The earlier claim that the runtime was fixed was
premature; its verification did not exercise the existing profile fallback.

The follow-up repairs only lowercase drive letters in existing DSH fallback
junction targets, after the help probe and before server launch. It does not
traverse package trees, rewrite source, or remove session data. A junction is
renamed before replacement and restored if creation fails. POSIX is a no-op.

On the affected machine 28 junctions were repaired. A fresh Node resolver probe
loading agent-loop and file-upload through the real profile fallback initially
reported both file:///C:/.../scope/lib/index.js and file:///c:/.../scope/lib/index.js.
After repair it reported only the uppercase URL. An isolated junction integration
test verifies shared ESM Symbol identity, idempotence, and preservation of package
files. A live DSH process still needs restart to discard its already loaded copies.
