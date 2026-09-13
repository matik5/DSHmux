# Windows runtime repair — Summary

- Fixed Doctor's false `node-missing` result for Node under `Program Files` by
  probing the executable without `cmd.exe`.
- Unified Doctor and installer npm resolution, including user-prefix npm under
  `%APPDATA%`, using shell-free structured argv.
- Stopped caching Node discovery misses so **Check again** can see a newly
  installed runtime.
- Made successful managed repair refresh Doctor, visibly report the ready
  state, and resume DSH startup.
- Added Windows contract, cache-refresh, and post-repair regressions while
  retaining the existing macOS/POSIX coverage.
- Replaced the duplicate-Cancel dialog with explicit global and project install
  choices plus **Change…**. The project default uses `.dshmux`; a changed
  location creates a normal official `deepseek-harness` checkout instead.
