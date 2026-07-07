import {
  IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator'

const SCOPES = ['personal', 'department', 'project']
const PRIORITIES = ['low', 'normal', 'high', 'urgent']
const SECTIONS = ['suvu', 'kehoach', 'hangngay', 'phatsinh']
const MODES = ['self', 'review_required']

export class CreateTaskDto {
  @IsString() @MaxLength(255) title!: string
  @IsOptional() @IsString() description?: string
  @IsIn(SCOPES) scope!: string
  @IsOptional() @IsString() departmentId?: string
  @IsOptional() @IsString() projectId?: string
  @IsOptional() @IsIn(SECTIONS) section?: string
  @IsOptional() @IsString() assigneeId?: string
  @IsOptional() @IsIn(PRIORITIES) priority?: string
  @IsOptional() @IsIn(MODES) completionMode?: string
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
