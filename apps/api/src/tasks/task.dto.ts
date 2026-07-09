import {
  IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator'

const PRIORITIES = ['low', 'normal', 'high', 'urgent']
const SECTIONS = ['suvu', 'kehoach', 'hangngay', 'phatsinh']
const MODES = ['self', 'review_required']

export class CreateTaskDto {
  @IsString() @MaxLength(255) title!: string
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsString() @MaxLength(2000) expectedOutput?: string
  @IsOptional() @IsString() workspaceId?: string | null // DEPRECATED (FE cũ) — null = việc cá nhân
  // Freeze §5: chiều tường minh (A3 gửi trực tiếp; A2 vẫn suy được từ workspaceId cho FE cũ)
  @IsOptional() @IsString() orgUnitId?: string | null
  @IsOptional() @IsString() projectId?: string | null
  @IsOptional() @IsString() actionId?: string | null
  @IsOptional() @IsIn(SECTIONS) section?: string
  @IsOptional() @IsString() assigneeId?: string
  @IsOptional() @IsIn(PRIORITIES) priority?: string
  @IsOptional() @IsIn(MODES) completionMode?: string // DEPRECATED — dùng reviewRequired
  @IsOptional() @IsBoolean() reviewRequired?: boolean
  // KPI evidence (freeze §8): is_scorable ⇒ reviewRequired + kpiDefinitionId + kpiWeight (validate ở service)
  @IsOptional() @IsBoolean() isScorable?: boolean
  @IsOptional() @IsString() kpiDefinitionId?: string | null
  @IsOptional() @IsNumber() kpiWeight?: number | null
  @IsOptional() @IsDateString() startDate?: string
  @IsOptional() @IsDateString() dueDate?: string
  @IsOptional() @IsArray() @IsString({ each: true }) collaboratorIds?: string[]
  @IsOptional() @IsArray() @IsString({ each: true }) subtasks?: string[]
}

export class StatusDto {
  @IsIn(['todo', 'doing', 'waiting', 'done', 'paused']) status!: string
}
export class AssigneeDto {
  @IsString() assigneeId!: string
}
export class DueDateDto {
  @IsOptional() @IsDateString() dueDate?: string | null
}
export class PriorityDto {
  @IsIn(PRIORITIES) priority!: string
}
export class ProgressDto {
  @IsInt() @Min(0) @Max(100) progress!: number
}
export class UpdateTaskDto {
  @IsOptional() @IsString() @MaxLength(255) title?: string
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsString() @MaxLength(2000) expectedOutput?: string
  @IsOptional() @IsIn(SECTIONS) section?: string
  @IsOptional() @IsDateString() startDate?: string | null
}
export class ReviewDto {
  @IsIn(['passed', 'returned']) decision!: string
  @IsOptional() @IsString() @MaxLength(2000) note?: string
}
export class CreateCommentDto {
  @IsString() @MaxLength(5000) content!: string
}
export class CreateSubtaskDto {
  @IsString() @MaxLength(255) title!: string
  @IsOptional() @IsString() assigneeId?: string
}
export class UpdateSubtaskDto {
  @IsOptional() @IsBoolean() done?: boolean
  @IsOptional() @IsString() @MaxLength(255) title?: string
}
