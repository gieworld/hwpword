// Builds rhwp-studio for the desktop app. Studio's own npm scripts use POSIX `VAR=1 cmd` syntax,
// which npm runs through cmd.exe on Windows, so the environment is set here instead.
import { execSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const studioDir = join(dirname(dirname(fileURLToPath(import.meta.url))), '..', 'rhwp-studio');
// The hwpctl (ActiveX compatibility) plugin is irrelevant on the desktop; this tree-shakes it out.
const env = { ...process.env, RHWP_WITHOUT_HWPCTRL: '1' };

execSync('npx tsc', { cwd: studioDir, env, stdio: 'inherit' });
execSync('npx vite build', { cwd: studioDir, env, stdio: 'inherit' });

// rhwp-studio/public/fonts is a git symlink to ../../assets/fonts, which Git on Windows checks out as a
// plain text file; replace the copied stub with the real bundled fonts.
const distFonts = join(studioDir, 'dist', 'fonts');
rmSync(distFonts, { recursive: true, force: true });
cpSync(join(studioDir, '..', 'assets', 'fonts'), distFonts, { recursive: true });
