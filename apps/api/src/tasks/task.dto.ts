import {
  IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator'

const PRIORITIES = ['low', 'normal', 'high', 'urgent']
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
  @IsOptional() @IsString() sectionId?: string | null // "Section" (danh sách chung admin) — null = gỡ
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
  // P0-2: người nghiệm thu chỉ định — BẮT BUỘC khi reviewRequired=true (validate ở service)
  @IsOptional() @IsString() reviewerId?: string
  // A (13/07): việc CÁ NHÂN riêng tư → KHÔNG gắn đơn vị/dự án (chỉ người liên quan thấy)
  @IsOptional() @IsBoolean() personal?: boolean
  // B (13/07): tạo ở dạng NHÁP (quick-add) — chỉ người tạo thấy, không bắn thông báo tới khi kích hoạt
  @IsOptional() @IsBoolean() draft?: boolean
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
  @IsOptional() @IsString() sectionId?: string | null // "Section" (null = gỡ)
  @IsOptional() @IsDateString() startDate?: string | null
  // P0: sửa 2 chiều phân loại sau khi tạo (null = gỡ) — validate ở service
  @IsOptional() projectId?: string | null
  @IsOptional() actionId?: string | null
  // P0-2: bật/tắt cần nghiệm thu + đổi người nghiệm thu (null = gỡ, chỉ khi reviewRequired=false)
  @IsOptional() @IsBoolean() reviewRequired?: boolean
  @IsOptional() reviewerId?: string | null
  // A/B (13/07): chuyển task về CÁ NHÂN riêng tư → gỡ đơn vị/dự án/action
  @IsOptional() @IsBoolean() personal?: boolean
}
// Chọn nhiều task → đổi "Section" (sectionId) hàng loạt.
// Chỉ áp cho những task caller được quyền quản lý; task khác bị bỏ qua (không lỗi cả lô).
export class BulkClassifyDto {
  @IsArray() @IsString({ each: true }) ids!: string[]
  @IsOptional() @IsString() sectionId?: string | null // "Section" (null = gỡ khỏi section)
}
// FEATURE-004: sửa người phối hợp sau khi tạo (client gửi TOÀN BỘ danh sách — server diff)
export class CollaboratorsDto {
  @IsArray() @IsString({ each: true }) collaboratorIds!: string[]
}
// FEATURE-004: chuyển đơn vị yêu cầu của task (org_unit — chiều duy nhất theo freeze)
export class TaskOrgUnitDto {
  @IsString() orgUnitId!: string
}
export class ReviewDto {
  @IsIn(['passed', 'returned']) decision!: string
  @IsOptional() @IsString() @MaxLength(2000) note?: string
}
export class WorkLogDto {
  @IsString() @MaxLength(2000) content!: string
  @IsOptional() @IsInt() @Min(0) @Max(100) progressValue?: number
}
export class CreateCommentDto {
  @IsString() @MaxLength(5000) content!: string
  @IsOptional() @IsArray() @IsString({ each: true }) mentionIds?: string[]
}
export class CreateSubtaskDto {
  @IsString() @MaxLength(255) title!: string
  @IsOptional() @IsString() assigneeId?: string
}
export class UpdateSubtaskDto {
  @IsOptional() @IsBoolean() done?: boolean
  @IsOptional() @IsString() @MaxLength(255) title?: string
}
