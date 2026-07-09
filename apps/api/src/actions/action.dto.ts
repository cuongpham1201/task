import {
  IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, IsDateString,
} from 'class-validator'

export const ACTION_STATUS = ['draft', 'in_progress', 'on_hold', 'at_risk', 'done', 'cancelled']
export const ACTION_UPDATE_TYPE = ['progress', 'issue', 'risk', 'recommendation', 'decision', 'result', 'note']
const PRIORITIES = ['low', 'normal', 'high', 'urgent']
const PROGRESS_MODES = ['manual', 'auto_from_tasks']

export class CreateActionDto {
  @IsString() @MaxLength(255) title!: string
  @IsOptional() @IsString() description?: string
  @IsString() orgUnitId!: string // bắt buộc — đơn vị chịu trách nhiệm
  @IsOptional() @IsString() projectId?: string | null
  @IsOptional() @IsString() ownerId?: string // mặc định = người tạo
  @IsOptional() @IsDateString() deadline?: string | null
  @IsOptional() @IsIn(PRIORITIES) priority?: string
  @IsOptional() @IsIn(PROGRESS_MODES) progressMode?: string
  @IsOptional() @IsString() @MaxLength(7) period?: string // 'YYYY-MM'
}

export class UpdateActionDto {
  @IsOptional() @IsString() @MaxLength(255) title?: string
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsString() ownerId?: string
  @IsOptional() @IsString() projectId?: string | null
  @IsOptional() @IsDateString() deadline?: string | null
  @IsOptional() @IsIn(ACTION_STATUS) status?: string
  @IsOptional() @IsIn(PRIORITIES) priority?: string
  @IsOptional() @IsIn(PROGRESS_MODES) progressMode?: string
  @IsOptional() @IsInt() @Min(0) @Max(100) progress?: number
  @IsOptional() @IsString() @MaxLength(7) period?: string
}

// Nhật ký điều hành — append-only. statusTo/progressValue tùy chọn để đồng thời chuyển trạng thái/tiến độ.
export class CreateActionUpdateDto {
  @IsIn(ACTION_UPDATE_TYPE) type!: string
  @IsString() @MaxLength(4000) content!: string
  @IsOptional() @IsInt() @Min(0) @Max(100) progressValue?: number
  @IsOptional() @IsIn(ACTION_STATUS) statusTo?: string
}
