import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const packageDir = path.join(repoRoot, 'android/app/src/main/java/com/abhishek/abhilife');
const appGradle = path.join(repoRoot, 'android/app/build.gradle');

if (!fs.existsSync(path.join(repoRoot, 'android'))) {
  throw new Error('Android project not found. Run npx cap add android first.');
}

fs.mkdirSync(packageDir, { recursive: true });
fs.copyFileSync(
  path.join(repoRoot, 'native/android/AbhiLifeStoragePlugin.java'),
  path.join(packageDir, 'AbhiLifeStoragePlugin.java')
);
fs.copyFileSync(
  path.join(repoRoot, 'native/android/MainActivity.java'),
  path.join(packageDir, 'MainActivity.java')
);

let gradle = fs.readFileSync(appGradle, 'utf8');
const dependency = 'implementation "androidx.documentfile:documentfile:1.1.0"';
if (!gradle.includes(dependency)) {
  const marker = 'dependencies {';
  if (!gradle.includes(marker)) throw new Error('Unable to locate Android dependencies block.');
  gradle = gradle.replace(marker, `${marker}\n    ${dependency}`);
  fs.writeFileSync(appGradle, gradle);
}

console.log('Prepared Android project with AbhiLife SAF storage plugin.');
