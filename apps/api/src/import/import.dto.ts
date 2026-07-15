import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator'
import { IMPORT_LIMITS } from './import.constants'

// rawJson nhận dạng STRING (server tự JSON.parse an toàn) — tránh whitelist DTO lồng.
export class ParseAsanaDto {
  @IsString() @MaxLength(IMPORT_LIMITS.MAX_RAW_BYTES * 2) rawJson!: string
  // Tùy chọn: CSV export Asana để map người theo email (ghép JSON+CSV theo Task ID)
  @IsOptional() @IsString() @MaxLength(IMPORT_LIMITS.MAX_RAW_BYTES * 2) rawCsv?: string
}

// config là object key-động (userMap/overrides theo gid) → @IsObject (sanitize thủ công ở service).
export class PreviewAsanaDto {
  @IsString() @MaxLength(64) batchId!: string
  @IsObject() config!: Record<string, any>
  @IsOptional() @IsString() @MaxLength(64) defaultOrgUnitId?: string
  @IsOptional() @IsString() @MaxLength(64) targetProjectId?: string
}

export class ExecuteAsanaDto {
  @IsString() @MaxLength(64) batchId!: string
  @IsObject() config!: Record<string, any>
  @IsOptional() @IsString() @MaxLength(64) defaultOrgUnitId?: string
  @IsOptional() @IsString() @MaxLength(64) targetProjectId?: string
  @IsOptional() @IsObject() createProject?: { name: string; memberIds?: string[] }
}
