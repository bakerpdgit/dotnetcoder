// Writes public/dotnet/references.json: the list of assemblies the browser
// fetches and hands to Roslyn as compilation references.
//
// The published framework doubles as the reference set (there is no ref pack in
// a WASM bundle). The browser has already downloaded these exact URLs to boot
// the runtime, so the second fetch is served from the HTTP cache.
import { existsSync, openSync, readSync, closeSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const runtimeDir = resolve(process.argv[2] ?? 'public/dotnet')
const frameworkDir = join(runtimeDir, '_framework')

if (!existsSync(frameworkDir)) {
  console.error(`make-references: ${frameworkDir} does not exist. Run the publish step first.`)
  process.exit(1)
}

// Roslyn itself and the runner host are loaded by the runtime but must not be
// offered to student code as references.
const EXCLUDE = [
  /^Microsoft\.CodeAnalysis/i,
  /^DotNetCoder\.Runner/i,
  /\.resources\./i,
]

/**
 * True if the file is a PE image that actually carries a CLI header, i.e.
 * something Roslyn can read as metadata.
 *
 * The "MZ" signature alone is not enough: a native Windows library is also a
 * PE, and handing one to Roslyn produces CS0009 ("PE image doesn't contain
 * managed metadata") on every compilation rather than a useful error. Data
 * directory 14 holds the CLI header, and it is zero for native images.
 *
 * Checking content rather than extension also means a change of SDK naming
 * convention cannot silently produce an empty reference list, and it naturally
 * skips dotnet.native.wasm, icudt*.dat and the JavaScript files.
 */
function isManagedAssembly(path) {
  let fd
  try {
    fd = openSync(path, 'r')
    const header = Buffer.alloc(0x400)
    const bytesRead = readSync(fd, header, 0, header.length, 0)
    if (bytesRead < 0x40) return false
    if (header[0] !== 0x4d || header[1] !== 0x5a) return false // "MZ"

    const peOffset = header.readUInt32LE(0x3c)
    if (peOffset <= 0 || peOffset + 24 > bytesRead) return false
    if (header.readUInt32LE(peOffset) !== 0x00004550) return false // "PE\0\0"

    const optionalHeader = peOffset + 24
    if (optionalHeader + 2 > bytesRead) return false
    const magic = header.readUInt16LE(optionalHeader)
    // PE32 keeps the data directories at +96, PE32+ at +112.
    const dataDirectories = magic === 0x10b ? optionalHeader + 96
      : magic === 0x20b ? optionalHeader + 112
      : -1
    if (dataDirectories < 0) return false

    const cliDirectory = dataDirectories + 14 * 8
    if (cliDirectory + 4 > bytesRead) return false
    return header.readUInt32LE(cliDirectory) !== 0
  } catch {
    return false
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

const allFiles = readdirSync(frameworkDir).filter(name => statSync(join(frameworkDir, name)).isFile())
const assemblies = allFiles.filter(name => isManagedAssembly(join(frameworkDir, name)))

if (assemblies.length === 0) {
  const wasmCount = allFiles.filter(n => n.toLowerCase().endsWith('.wasm')).length
  console.error(
    'make-references: no managed assemblies were found in _framework.\n' +
    `  ${allFiles.length} files present, ${wasmCount} of them .wasm.\n` +
    '  The assemblies were almost certainly packaged as Webcil, which wraps them\n' +
    '  in a WASM container that Roslyn cannot read as a MetadataReference.\n' +
    '  Check that <WasmEnableWebcil>false</WasmEnableWebcil> is set in\n' +
    '  runtime/DotNetCoder.Runner/DotNetCoder.Runner.csproj and publish again.',
  )
  process.exit(1)
}

const references = assemblies
  .filter(name => !EXCLUDE.some(re => re.test(name)))
  .sort((a, b) => a.localeCompare(b))

const totalBytes = references.reduce((sum, name) => sum + statSync(join(frameworkDir, name)).size, 0)
const bundleBytes = allFiles.reduce((sum, name) => sum + statSync(join(frameworkDir, name)).size, 0)

writeFileSync(
  join(runtimeDir, 'references.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), references }, null, 2) + '\n',
)

const mb = (n) => (n / 1024 / 1024).toFixed(1) + ' MB'
console.log(`make-references: ${references.length} reference assemblies (${mb(totalBytes)})`)
console.log(`                 _framework total ${mb(bundleBytes)} uncompressed`)
console.log(`                 excluded ${assemblies.length - references.length} assemblies (compiler + host)`)
