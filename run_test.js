const { execSync } = require('child_process');
try {
  execSync('pnpm -r --if-present run test -- --run artifacts/api-server/src/moderation/__tests__/router-boundaries.test.ts', { stdio: 'pipe' });
} catch (e) {
  console.log(e.stdout.toString());
}
