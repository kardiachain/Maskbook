import { ECKeyIdentifier, IdentifierMap, PostIVIdentifier, ProfileIdentifier } from '@masknet/shared-base'
import { BackupErrors } from '../BackupErrors'
import { isBackupVersion0, normalizeBackupVersion0 } from '../version-0'
import { isBackupVersion1, normalizeBackupVersion1 } from '../version-1'
import { isBackupVersion2, normalizeBackupVersion2 } from '../version-2'
import type { NormalizedBackup } from './type'

export function normalizeBackup(data: unknown): NormalizedBackup.Data {
    if (isBackupVersion2(data)) return normalizeBackupVersion2(data)
    if (isBackupVersion1(data)) return normalizeBackupVersion1(data)
    if (isBackupVersion0(data)) return normalizeBackupVersion0(data)
    throw new TypeError(BackupErrors.UnknownFormat)
}
export function createEmptyNormalizedBackup(): NormalizedBackup.Data {
    return {
        meta: { version: 2 },
        personas: new IdentifierMap(new Map(), ECKeyIdentifier),
        profiles: new IdentifierMap(new Map(), ProfileIdentifier),
        posts: new IdentifierMap(new Map(), PostIVIdentifier),
        relations: [],
        settings: { grantedHostPermissions: [] },
        wallets: [],
        plugins: {},
    }
}
