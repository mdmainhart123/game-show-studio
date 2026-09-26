// Builds the Windows app:  npm run build:win
// Output: dist/Game Show Studio-win32-x64/Game Show Studio.exe
const { packager } = require('@electron/packager');
const ResEdit = require('resedit');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));

(async () => {
  const [outDir] = await packager({
    dir: ROOT,
    out: path.join(ROOT, 'dist'),
    name: pkg.productName,
    executableName: pkg.productName,
    platform: 'win32',
    arch: 'x64',
    overwrite: true,
    asar: true,
    prune: true,
    ignore: [/^\/dist($|\/)/, /^\/release($|\/)/, /^\/lite($|\/)/, /^\/build($|\/)/, /^\/templates($|\/)/, /^\/README/, /\.zip$/],
  });

  // Set the .exe icon and file details (pure JS, so it also works from Mac/Linux).
  const exePath = path.join(outDir, pkg.productName + '.exe');
  const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);
  const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(__dirname, 'icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const groupId = groups.length ? groups[0].id : 1;
  const lang = groups.length ? groups[0].lang : 1033;
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, groupId, lang, ico.icons.map(i => i.data));

  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
  const [maj, min, pat] = pkg.version.split('.').map(Number);
  vi.setFileVersion(maj, min, pat, 0, 1033);
  vi.setProductVersion(maj, min, pat, 0, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, {
    FileDescription: pkg.productName,
    ProductName: pkg.productName,
    CompanyName: pkg.author,
    OriginalFilename: pkg.productName + '.exe',
    InternalName: pkg.productName,
    LegalCopyright: `© ${new Date().getFullYear()} ${pkg.author}`,
  });
  vi.outputToResourceEntries(res.entries);
  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));

  console.log('Built:', exePath);
})().catch(e => { console.error(e); process.exit(1); });
