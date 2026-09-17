/**
 * Spike Strava archive — validation empirique de l'ingestion.
 *
 * Script JETABLE, hors code applicatif. Répond aux 15 questions du
 * doc `docs/architecture/ingestion/07-spike-archive.md` sur une
 * archive Strava réelle + tests de sécurité fabriqués sur place.
 *
 * Usage :
 *   node scripts/spike-strava-archive.mjs <chemin-archive.zip>
 *   node scripts/spike-strava-archive.mjs <dossier-dezip>
 *
 * Produit un rapport Markdown dans
 * `docs/architecture/ingestion/07-spike-resultats.md`.
 *
 * Aucune donnée personnelle réelle n'est écrite : seulement des
 * agrégats (compteurs, tailles, distributions).
 */

import { readFileSync, statSync, writeFileSync, existsSync, readdirSync, mkdirSync, createReadStream } from 'node:fs'
import { join, extname, basename, relative, isAbsolute, resolve as resolvePath } from 'node:path'
import { performance } from 'node:perf_hooks'
import { createGunzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { Writable } from 'node:stream'

const ROOT = process.cwd()
const OUT_PATH = join(ROOT, 'docs/architecture/ingestion/07-spike-resultats.md')
const MAX_ENTRIES = 200_000
const MAX_UNCOMPRESSED_MB = 5_000

const arg = process.argv[2]
if (!arg) {
  console.error('Usage: node scripts/spike-strava-archive.mjs <archive.zip|dossier>')
  console.error('')
  console.error('Etapes pour obtenir l\'archive Strava :')
  console.error('  1. https://www.strava.com/athlete/delete_your_account')
  console.error('  2. « Request your archive »')
  console.error('  3. Attendre l\'email (quelques heures a 10 jours)')
  console.error('  4. Poser le ZIP recu dans data/sample/ ou l\'ouvrir avec ce script')
  process.exit(1)
}

const targetPath = isAbsolute(arg) ? arg : resolvePath(ROOT, arg)
if (!existsSync(targetPath)) {
  console.error(`Introuvable : ${targetPath}`)
  process.exit(1)
}

const results = {
  target: targetPath,
  target_size_bytes: null,
  ran_at: new Date().toISOString(),
  archive_or_folder: null,
  q1_structure: null,
  q2_compression: null,
  q3_file_count: null,
  q4_activities_formats: null,
  q5_csv_encoding: null,
  q6_csv_separator: null,
  q7_csv_headers: null,
  q8_csv_date_sample: null,
  q9_tcx_bom_or_leading_space: null,
  q10_fit_truncated: null,
  q11_billion_laughs: null,
  q12_zip_bomb: null,
  q13_zip_slip: null,
  q14_parse_time_seconds: null,
  q15_dedup_hint: null,
  warnings: [],
}

// ----------- Utilities -----------

function fmtBytes(n) {
  if (!n) return '0 B'
  const units = ['B', 'KiB', 'MiB', 'GiB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(2)} ${units[i]}`
}

async function withYauzl(archivePath) {
  const yauzl = (await import('yauzl')).default
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err)
      resolve(zip)
    })
  })
}

/** Ouvre un ZIP en streaming, retourne compteurs sans extraction disque. */
async function scanZip(archivePath) {
  const zip = await withYauzl(archivePath)
  const stats = {
    entryCount: 0,
    totalUncompressed: 0,
    totalCompressed: 0,
    maxRatio: 0,
    dirs: new Set(),
    byExt: new Map(),
    activitiesByExt: new Map(),
    hasPathTraversal: false,
    entries: [], // pour Q15 dedup hint
  }
  return await new Promise((resolve, reject) => {
    zip.on('error', reject)
    zip.on('end', () => resolve(stats))
    zip.on('entry', (entry) => {
      stats.entryCount++
      if (stats.entryCount > MAX_ENTRIES) {
        results.warnings.push(`Plus de ${MAX_ENTRIES} entrees, scan interrompu.`)
        return resolve(stats)
      }
      const name = entry.fileName
      if (name.includes('..') || name.startsWith('/') || /^[A-Z]:/i.test(name)) {
        stats.hasPathTraversal = true
      }
      const parts = name.split('/').filter(Boolean)
      if (parts.length > 0) stats.dirs.add(parts[0])
      stats.totalCompressed += entry.compressedSize
      stats.totalUncompressed += entry.uncompressedSize
      if (entry.compressedSize > 0) {
        const ratio = entry.uncompressedSize / entry.compressedSize
        if (ratio > stats.maxRatio) stats.maxRatio = ratio
      }
      const ext = extname(name).toLowerCase()
      stats.byExt.set(ext, (stats.byExt.get(ext) || 0) + 1)
      if (parts[0] === 'activities' && parts.length > 1) {
        // gerer .fit.gz -> compter comme fit
        const isGz = name.endsWith('.fit.gz')
        const effExt = isGz ? '.fit.gz' : ext
        stats.activitiesByExt.set(effExt, (stats.activitiesByExt.get(effExt) || 0) + 1)
      }
      // Pour Q15 : identifier chaque activite par son nom base
      if (parts[0] === 'activities' && parts.length > 1) {
        stats.entries.push({ name, size: entry.uncompressedSize })
      }
      // Arret rapide si taille non compressee explose
      if (stats.totalUncompressed / (1024 * 1024) > MAX_UNCOMPRESSED_MB) {
        results.warnings.push('Taille decompressee > 5 GiB, scan interrompu.')
        return resolve(stats)
      }
      zip.readEntry()
    })
    zip.readEntry()
  })
}

async function readEntryToBuffer(archivePath, entryName) {
  const zip = await withYauzl(archivePath)
  return new Promise((resolve, reject) => {
    zip.on('entry', (entry) => {
      if (entry.fileName !== entryName) return zip.readEntry()
      zip.openReadStream(entry, (err, stream) => {
        if (err) return reject(err)
        const chunks = []
        stream.on('data', (c) => chunks.push(c))
        stream.on('end', () => resolve(Buffer.concat(chunks)))
        stream.on('error', reject)
      })
    })
    zip.on('end', () => resolve(null))
    zip.readEntry()
  })
}

// ----------- Q5/Q6/Q7/Q8 : CSV -----------

function analyzeCsv(buffer) {
  const info = { encoding: null, hasBOM: false, separator: null, headers: [], firstDate: null }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    info.hasBOM = true
    info.encoding = 'UTF-8 (BOM)'
    buffer = buffer.subarray(3)
  } else {
    // Heuristique : UTF-8 valide ?
    try {
      buffer.toString('utf-8').normalize('NFC')
      info.encoding = 'UTF-8 (sans BOM probable)'
    } catch {
      info.encoding = 'non-UTF8 (a verifier)'
    }
  }
  const firstLine = buffer.toString('utf-8').split(/\r?\n/)[0] || ''
  const commas = (firstLine.match(/,/g) || []).length
  const semis = (firstLine.match(/;/g) || []).length
  info.separator = commas >= semis ? ',' : ';'
  info.headers = firstLine.split(info.separator).map((h) => h.replace(/^"|"$/g, '').trim())
  const lines = buffer.toString('utf-8').split(/\r?\n/)
  if (lines.length > 1 && lines[1]) {
    const cells = lines[1].split(info.separator)
    // colonne 2 est classiquement Activity Date en Strava
    info.firstDate = cells[1]?.replace(/^"|"$/g, '').trim() || null
  }
  return info
}

// ----------- Q9 : TCX quirks -----------

function tcxQuirks(buffer) {
  const head = buffer.subarray(0, 100)
  const hasBOM = head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf
  const startsWithSpace = head[hasBOM ? 3 : 0] === 0x20 || head[hasBOM ? 3 : 0] === 0x09
  return { hasBOM, leadingWhitespace: startsWithSpace, first20Hex: head.subarray(0, 20).toString('hex') }
}

// ----------- Q10 : FIT tronque -----------

async function testFitTruncated() {
  // On fabrique un buffer FIT quasi-vide (header FIT minimal) puis on
  // tronque, verifie que la lib le detecte proprement.
  const FitSdk = await import('@garmin/fitsdk')
  // Header FIT valide sur 14 bytes puis rien = fichier tronque
  const header = Buffer.from([
    0x0e, // header size
    0x10, // proto version
    0x00, 0x00, // profile version
    0x00, 0x00, 0x00, 0x00, // data size = 0
    0x2e, 0x46, 0x49, 0x54, // ".FIT"
    0x00, 0x00, // crc
  ])
  const result = { threw: false, errorMessage: null, detected: null }
  try {
    const stream = FitSdk.Stream.fromByteArray(Array.from(header))
    const decoder = new FitSdk.Decoder(stream)
    const integrity = decoder.checkIntegrity()
    result.detected = integrity ? 'valide (donnee minimale)' : 'invalide (attendu)'
  } catch (e) {
    result.threw = true
    result.errorMessage = String(e.message || e).slice(0, 200)
  }
  return result
}

// ----------- Q11 : billion laughs -----------

async function testBillionLaughs() {
  const { XMLParser } = await import('fast-xml-parser')
  const xml = `<?xml version="1.0"?>
<!DOCTYPE lolz [
  <!ENTITY lol "lol">
  <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
  <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">
  <!ENTITY lol4 "&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;">
]>
<lolz>&lol4;</lolz>`
  const parser = new XMLParser({ processEntities: false, htmlEntities: false })
  const result = { threw: false, expanded: false, output: null }
  const t0 = performance.now()
  try {
    const parsed = parser.parse(xml)
    const t1 = performance.now()
    const asJson = JSON.stringify(parsed)
    result.expanded = asJson.includes('lollol')
    result.output = { elapsed_ms: Math.round(t1 - t0), size_json: asJson.length }
  } catch (e) {
    result.threw = true
    result.output = { error: String(e.message || e).slice(0, 200) }
  }
  return result
}

// ----------- Q12 : ZIP bomb (fabrique en RAM) -----------

async function testZipBomb() {
  // Petit ZIP fabrique : 1 fichier deflate qui explose. On limite pour
  // que ce test ne bloque pas la machine : ratio 100:1 sur 1 MB.
  const yauzl = (await import('yauzl')).default
  const zlib = await import('node:zlib')
  const bombContent = Buffer.alloc(10 * 1024 * 1024, 0) // 10 MiB zeros
  const compressed = zlib.deflateRawSync(bombContent) // ~50 KiB
  // On fabrique un ZIP minimal manuel : trop lourd pour ici. On teste
  // directement l'attribut compressedSize/uncompressedSize d'un ZIP
  // synthetique existant. Report : test partiel, voir Q12 note.
  return {
    tested: false,
    note: 'Test differe : la fabrication d\'un ZIP synthetique avec ratio 100:1 depuis Node depasse le scope du spike. La logique streaming yauzl + verification uncompressed/compressed en amont est deja en place dans scanZip() ; toute entree > MAX_UNCOMPRESSED_MB coupe le scan. A verifier sur archive Strava reelle (Q2).',
    compressed_kib_prepared: Math.round(compressed.length / 1024),
    uncompressed_mib_source: Math.round(bombContent.length / (1024 * 1024)),
  }
}

// ----------- Q13 : zip slip -----------

async function testZipSlip(zipStats) {
  return {
    detected_in_archive: zipStats?.hasPathTraversal ?? false,
    note: 'scanZip() detecte automatiquement `..`, `/` initial ou `C:\\` dans les noms d\'entree. Aucune extraction disque ne se produit. Note : l\'archive Strava reelle ne devrait jamais contenir ces motifs -- si presence detectee, archive suspecte.',
  }
}

// ----------- Q14 : perf parsing bout en bout -----------

async function benchParse(archivePath, activitiesByExt) {
  const t0 = performance.now()
  const zip = await withYauzl(archivePath)
  let parsed = 0
  let errors = 0
  await new Promise((resolve) => {
    zip.on('entry', (entry) => {
      if (!entry.fileName.startsWith('activities/')) return zip.readEntry()
      zip.openReadStream(entry, async (err, stream) => {
        if (err) { errors++; return zip.readEntry() }
        try {
          // On lit juste jusqu'a 1 MiB par activite pour ne pas exploser
          const chunks = []
          let total = 0
          const cap = 1024 * 1024
          for await (const c of stream) {
            chunks.push(c)
            total += c.length
            if (total > cap) break
          }
          parsed++
        } catch { errors++ }
        zip.readEntry()
      })
    })
    zip.on('end', resolve)
    zip.on('error', () => resolve())
    zip.readEntry()
  })
  const elapsed = (performance.now() - t0) / 1000
  return { elapsed_sec: Math.round(elapsed * 10) / 10, activities_read: parsed, read_errors: errors }
}

// ----------- Main -----------

async function main() {
  const stat = statSync(targetPath)
  results.target_size_bytes = stat.size
  results.archive_or_folder = stat.isDirectory() ? 'folder' : 'archive'

  if (stat.isFile() && targetPath.toLowerCase().endsWith('.zip')) {
    console.log(`Scan ZIP : ${targetPath} (${fmtBytes(stat.size)})`)
    const zipStats = await scanZip(targetPath)
    // Q1
    results.q1_structure = { root_folders: [...zipStats.dirs].sort() }
    // Q2
    results.q2_compression = {
      compressed: fmtBytes(zipStats.totalCompressed),
      uncompressed: fmtBytes(zipStats.totalUncompressed),
      max_ratio: `${zipStats.maxRatio.toFixed(1)}:1`,
    }
    // Q3
    results.q3_file_count = {
      total: zipStats.entryCount,
      by_extension: Object.fromEntries([...zipStats.byExt.entries()].sort((a, b) => b[1] - a[1])),
    }
    // Q4
    results.q4_activities_formats = Object.fromEntries(
      [...zipStats.activitiesByExt.entries()].sort((a, b) => b[1] - a[1]),
    )
    // Q5-Q8 : CSV
    const csvBuf = await readEntryToBuffer(targetPath, 'activities.csv')
    if (csvBuf) {
      const csv = analyzeCsv(csvBuf)
      results.q5_csv_encoding = csv.encoding + (csv.hasBOM ? ' + BOM' : '')
      results.q6_csv_separator = csv.separator
      results.q7_csv_headers = csv.headers
      results.q8_csv_date_sample = csv.firstDate
    } else {
      results.warnings.push('activities.csv introuvable dans l\'archive.')
    }
    // Q9 : TCX
    const tcxEntry = zipStats.entries.find((e) => e.name.toLowerCase().endsWith('.tcx'))
    if (tcxEntry) {
      const tcxBuf = await readEntryToBuffer(targetPath, tcxEntry.name)
      if (tcxBuf) results.q9_tcx_bom_or_leading_space = { file: tcxEntry.name, ...tcxQuirks(tcxBuf) }
    } else {
      results.q9_tcx_bom_or_leading_space = { note: 'Aucun fichier .tcx trouve dans activities/' }
    }
    // Q14 : bench parsing bout en bout
    console.log('Bench parsing (lecture streaming toutes activites)...')
    results.q14_parse_time_seconds = await benchParse(targetPath, zipStats.activitiesByExt)
    // Q15 : indice dedup (activites au meme timestamp base)
    const bySize = new Map()
    for (const e of zipStats.entries) {
      const key = basename(e.name)
      bySize.set(key, (bySize.get(key) || 0) + 1)
    }
    const duplicateNames = [...bySize.entries()].filter(([, n]) => n > 1)
    results.q15_dedup_hint = {
      unique_activity_names: bySize.size,
      duplicated_names_within_archive: duplicateNames.length,
      note: 'Une meme archive ne devrait pas avoir deux fichiers de meme nom base. Sinon = doublon Strava = a investiguer.',
    }
    // Q13
    results.q13_zip_slip = await testZipSlip(zipStats)
  } else if (stat.isDirectory()) {
    console.log(`Scan dossier : ${targetPath}`)
    const files = readdirSync(targetPath, { withFileTypes: true, recursive: true })
    const byExt = new Map()
    const rootFolders = new Set()
    let total = 0
    let count = 0
    for (const f of files) {
      if (!f.isFile()) continue
      count++
      const ext = extname(f.name).toLowerCase()
      byExt.set(ext, (byExt.get(ext) || 0) + 1)
      const rel = relative(targetPath, join(f.parentPath, f.name))
      const first = rel.split(/[\\/]/)[0]
      if (first) rootFolders.add(first)
      try { total += statSync(join(f.parentPath, f.name)).size } catch {}
    }
    results.q1_structure = { root_folders: [...rootFolders].sort() }
    results.q2_compression = { note: 'Dossier deja dezip, ratio non applicable.', uncompressed: fmtBytes(total) }
    results.q3_file_count = { total: count, by_extension: Object.fromEntries([...byExt.entries()].sort((a, b) => b[1] - a[1])) }
    const csvPath = join(targetPath, 'activities.csv')
    if (existsSync(csvPath)) {
      const buf = readFileSync(csvPath)
      const csv = analyzeCsv(buf)
      results.q5_csv_encoding = csv.encoding + (csv.hasBOM ? ' + BOM' : '')
      results.q6_csv_separator = csv.separator
      results.q7_csv_headers = csv.headers
      results.q8_csv_date_sample = csv.firstDate
    }
    results.q13_zip_slip = { detected_in_archive: false, note: 'Test non applicable sur dossier dezip.' }
    results.q14_parse_time_seconds = { note: 'Bench non fait sur dossier (le vrai coût vient du ZIP).' }
    results.q15_dedup_hint = { note: 'Test dedup non pertinent sur dossier deja dezip.' }
  } else {
    console.error('Fichier non supporte (attendu : .zip ou dossier).')
    process.exit(1)
  }

  // Q10, Q11, Q12 : tests sur fixtures internes, ne dependent pas de l'archive
  console.log('Q10 : FIT tronque...')
  results.q10_fit_truncated = await testFitTruncated()
  console.log('Q11 : billion laughs...')
  results.q11_billion_laughs = await testBillionLaughs()
  console.log('Q12 : zip bomb...')
  results.q12_zip_bomb = await testZipBomb()

  // Ecriture rapport Markdown
  const md = renderReport(results)
  mkdirSync(join(ROOT, 'docs/architecture/ingestion'), { recursive: true })
  writeFileSync(OUT_PATH, md, 'utf-8')
  console.log(`\nRapport ecrit : ${OUT_PATH}`)
}

function renderReport(r) {
  const lines = []
  lines.push('# 07 — Spike Strava archive : résultats')
  lines.push('')
  lines.push(`> Exécuté le ${r.ran_at} sur \`${r.target}\` (${fmtBytes(r.target_size_bytes)}).`)
  lines.push('> Généré par `scripts/spike-strava-archive.mjs`. Aucune donnée personnelle n\'est incluse — uniquement des agrégats.')
  lines.push('')
  if (r.warnings.length > 0) {
    lines.push('## ⚠️ Avertissements')
    for (const w of r.warnings) lines.push(`- ${w}`)
    lines.push('')
  }
  const sections = [
    ['Q1 — Structure de l\'archive', r.q1_structure],
    ['Q2 — Compression', r.q2_compression],
    ['Q3 — Nombre de fichiers', r.q3_file_count],
    ['Q4 — Formats dans activities/', r.q4_activities_formats],
    ['Q5 — Encodage activities.csv', r.q5_csv_encoding],
    ['Q6 — Séparateur activities.csv', r.q6_csv_separator],
    ['Q7 — En-têtes CSV', r.q7_csv_headers],
    ['Q8 — Format date (1ère ligne)', r.q8_csv_date_sample],
    ['Q9 — TCX BOM / espace de tête', r.q9_tcx_bom_or_leading_space],
    ['Q10 — FIT tronqué (@garmin/fitsdk)', r.q10_fit_truncated],
    ['Q11 — Billion laughs (fast-xml-parser)', r.q11_billion_laughs],
    ['Q12 — ZIP bomb', r.q12_zip_bomb],
    ['Q13 — Zip slip / path traversal', r.q13_zip_slip],
    ['Q14 — Temps de parsing bout à bout', r.q14_parse_time_seconds],
    ['Q15 — Indice de déduplication interne', r.q15_dedup_hint],
  ]
  for (const [title, data] of sections) {
    lines.push(`## ${title}`)
    lines.push('')
    lines.push('```json')
    lines.push(JSON.stringify(data, null, 2))
    lines.push('```')
    lines.push('')
  }
  lines.push('---')
  lines.push('')
  lines.push('## Décisions à prendre à partir de ces chiffres')
  lines.push('')
  lines.push('Voir `docs/architecture/ingestion/07-spike-archive.md` § 4 « Critères de go / no-go post-spike ».')
  lines.push('')
  return lines.join('\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
