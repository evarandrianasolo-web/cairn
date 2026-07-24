/**
 * TEST D'ISOLATION MULTI-TENANT
 *
 * Le test le plus important du projet. Il vérifie qu'un tenant ne peut
 * atteindre aucune donnée d'un autre — au niveau de la base, pas de
 * l'application.
 *
 * Il doit passer avant chaque commit. Un échec ici n'est pas une
 * régression ordinaire : sur des données de santé, une fuite inter-tenant
 * est un incident à notifier à la CNIL.
 *
 * ⚠️ Ne jamais lancer contre une base contenant des données réelles —
 * ce test crée et supprime des utilisateurs.
 *
 * Lancer : npm run test:isolation
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

/** Tables soumises à l'isolation. Ajouter chaque nouvelle table ici. */
const TENANT_TABLES = [
  'athletes',
  'activities',
  'activity_health',
  'health_access_logs',
  'strava_connections',
  'races',
  'constraints',
  'plan_weeks',
  'planned_sessions',
  'session_templates',
  'fueling_logs',
  'debriefs',
  'coach_threads',
  'coach_messages',
  'consent_records',
  'plan_revisions',
  'ai_calls',
  'coach_proposals',
] as const

let admin: SupabaseClient
let clientA: SupabaseClient
let clientB: SupabaseClient
let userA: string
let userB: string

beforeAll(async () => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const a = await admin.auth.admin.createUser({
    email: `iso-a-${Date.now()}@test.local`,
    password: 'test-isolation-a',
    email_confirm: true,
  })
  const b = await admin.auth.admin.createUser({
    email: `iso-b-${Date.now()}@test.local`,
    password: 'test-isolation-b',
    email_confirm: true,
  })

  userA = a.data.user!.id
  userB = b.data.user!.id

  clientA = createClient(SUPABASE_URL, ANON_KEY)
  clientB = createClient(SUPABASE_URL, ANON_KEY)

  await clientA.auth.signInWithPassword({
    email: a.data.user!.email!,
    password: 'test-isolation-a',
  })
  await clientB.auth.signInWithPassword({
    email: b.data.user!.email!,
    password: 'test-isolation-b',
  })

  // Donnée appartenant à A uniquement.
  await admin.from('athletes').insert({ tenant_id: userA, display_name: 'A' })
  await admin.from('athletes').insert({ tenant_id: userB, display_name: 'B' })
})

afterAll(async () => {
  await admin.auth.admin.deleteUser(userA)
  await admin.auth.admin.deleteUser(userB)
})

describe('Isolation — lecture', () => {
  it.each(TENANT_TABLES)('B ne lit aucune ligne de A dans %s', async (table) => {
    const { data, error } = await clientB.from(table).select('*').eq('tenant_id', userA)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('une requête sans session ne retourne rien', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY)
    const { data } = await anon.from('athletes').select('*')
    expect(data ?? []).toEqual([])
  })
})

describe('Isolation — écriture', () => {
  it('B ne peut pas insérer une ligne au nom de A', async () => {
    const { error } = await clientB
      .from('athletes')
      .insert({ tenant_id: userA, display_name: 'usurpation' })
    expect(error).not.toBeNull()
  })

  it("B ne peut pas modifier une ligne de A", async () => {
    const { data } = await clientB
      .from('athletes')
      .update({ display_name: 'modifié par B' })
      .eq('tenant_id', userA)
      .select()
    expect(data ?? []).toEqual([])
  })

  it("B ne peut pas supprimer une ligne de A", async () => {
    const { data } = await clientB
      .from('athletes')
      .delete()
      .eq('tenant_id', userA)
      .select()
    expect(data ?? []).toEqual([])
  })
})

describe('Schéma — garanties structurelles', () => {
  const migrations = join(process.cwd(), 'supabase', 'migrations')

  const sql = () =>
    readdirSync(migrations)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(join(migrations, f), 'utf8'))
      .join('\n')
      .toLowerCase()

  // SQL débarrassé de ses commentaires, de ligne comme de bloc.
  // On cherche les champs interdits dans le schéma réel, pas dans la prose
  // qui l'explique : une migration doit pouvoir commenter la règle sans
  // déclencher le test qui l'applique.
  const sqlWithoutComments = () =>
    sql()
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/--[^\n]*/g, ' ')

  it('aucune table créée sans enable row level security', () => {
    const content = sql()
    const created = [...content.matchAll(/create table (?:if not exists )?(?:public\.)?(\w+)/g)]
      .map((m) => m[1])
    const secured = [...content.matchAll(/alter table (?:public\.)?(\w+) enable row level security/g)]
      .map((m) => m[1])
    expect(created.filter((t) => !secured.includes(t))).toEqual([])
  })

  it('aucun champ de poids, IMC ou calorie dans le schéma', () => {
    const forbidden = [
      'weight', 'poids', 'body_mass', 'bmi', 'imc',
      'body_fat', 'masse_grasse', 'calorie', 'kcal', 'energy_intake',
    ]
    const content = sqlWithoutComments()
    const found = forbidden.filter((w) => content.includes(w))
    expect(found).toEqual([])
  })
})

describe('Code applicatif — anti-patterns', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      if (e.name === 'node_modules' || e.name.startsWith('.')) return []
      const p = join(dir, e.name)
      return e.isDirectory() ? walk(p) : p.match(/\.(ts|tsx)$/) ? [p] : []
    })

  // Retire les commentaires TypeScript de ligne (//) et de bloc (/* */)
  // avant d'y chercher un anti-pattern. Une règle qui rejetterait son propre
  // énoncé dans un commentaire est fragile — un test robuste ne lit que le
  // code réel. Même principe que pour les commentaires SQL plus haut.
  const stripComments = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')

  it("aucun filtrage d'isolation en couche applicative", () => {
    const offenders = walk(join(process.cwd(), 'app'))
      .concat(walk(join(process.cwd(), 'lib')))
      .filter((f) => !f.includes('/tests/'))
      .filter((f) =>
        /\.eq\(\s*['"](tenant_id|user_id)['"]/.test(stripComments(readFileSync(f, 'utf8'))),
      )
    expect(offenders).toEqual([])
  })

  it("aucun tenant_id en paramètre d'outil IA", () => {
    const toolsFile = join(process.cwd(), 'lib', 'ai', 'tools.ts')
    const content = readFileSync(toolsFile, 'utf8')
    expect(/tenant_?[Ii]d\s*:\s*z\./.test(content)).toBe(false)
  })

  it("la clé service_role n'apparaît pas hors des tests", () => {
    const offenders = walk(join(process.cwd(), 'app'))
      .concat(walk(join(process.cwd(), 'lib')))
      .filter((f) => readFileSync(f, 'utf8').includes('SERVICE_ROLE'))
    expect(offenders).toEqual([])
  })
})
