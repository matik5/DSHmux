import * as fs from "node:fs";
import * as path from "node:path";

/** Repair only drive-letter spelling in DSH-owned fallback junctions. */
export function repairProfileLinkCasing(home: string, platform = process.platform): number {
  if (platform !== "win32") return 0;
  const modules = path.join(home, "profiles", "node_modules");
  if (!fs.existsSync(modules) || fs.lstatSync(modules).isSymbolicLink()) return 0;
  let repaired = 0;
  const repair = (link: string): void => {
    if (!fs.lstatSync(link).isSymbolicLink()) return;
    const target = fs.readlinkSync(link);
    const normalized = target.replace(/^([a-z]):/, (_, drive: string) => `${drive.toUpperCase()}:`);
    if (normalized === target || !fs.existsSync(normalized)) return;
    // Rename the junction itself; never traverse or delete its target.
    const backup = `${link}.dshmux-backup-${process.pid}`;
    if (fs.existsSync(backup)) throw new Error(`Profile link backup already exists: ${backup}`);
    fs.renameSync(link, backup);
    try {
      fs.symlinkSync(normalized, link, "junction");
    } catch (error) {
      fs.renameSync(backup, link);
      throw error;
    }
    fs.unlinkSync(backup);
    repaired++;
  };
  for (const entry of fs.readdirSync(modules, { withFileTypes: true })) {
    const candidate = path.join(modules, entry.name);
    if (entry.isSymbolicLink()) repair(candidate);
    else if (entry.isDirectory() && entry.name.startsWith("@")) {
      for (const child of fs.readdirSync(candidate)) repair(path.join(candidate, child));
    }
  }
  return repaired;
}
