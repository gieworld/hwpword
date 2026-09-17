// Builds rhwp-studio for the desktop app. Studio's own npm scripts use POSIX `VAR=1 cmd` syntax,
// which npm runs through cmd.exe on Windows, so the environment is set here instead.
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const studioDir = join(dirname(dirname(fileURLToPath(import.meta.url))), '..', 'rhwp-studio');
// The hwpctl (ActiveX compatibility) plugin is irrelevant on the desktop; this tree-shakes it out.
const env = { ...process.env, RHWP_WITHOUT_HWPCTRL: '1' };

execSync('npx tsc', { cwd: studioDir, env, stdio: 'inherit' });
execSync('npx vite build', { cwd: studioDir, env, stdio: 'inherit' });
