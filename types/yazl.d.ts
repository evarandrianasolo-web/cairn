// `yazl` (devDependency, fixtures de test uniquement) ne publie pas
// de types. Declaration minimale limitee a l'API utilisee par les
// tests d'ingestion.
declare module 'yazl' {
  import type { Readable } from 'node:stream'

  export class ZipFile {
    outputStream: Readable
    addBuffer(buffer: Buffer, metadataPath: string): void
    end(): void
  }

  const _default: { ZipFile: typeof ZipFile }
  export default _default
}
