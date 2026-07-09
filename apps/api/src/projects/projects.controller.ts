import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { IsOptional, IsString, MaxLength } from 'class-validator'
import { AuthGuard } from '../auth/auth.guard'
import { AuthUser } from '../auth/current-user.decorator'
import type { AuthClaims } from '../auth/auth.types'
import { PrismaService } from '../prisma/prisma.service'
import { UsersService } from '../users/users.service'

class AddMemberDto {
  @IsString() userId!: string
}
class CreateProjectDto {
  @IsString() @MaxLength(255) name!: string
  @IsOptional() @IsString() @MaxLength(2000) description?: string
}
class UpdateProjectDto {
  @IsOptional() @IsString() @MaxLength(255) name?: string
  @IsOptional() @IsString() @MaxLength(2000) description?: string
}

// Dự án = PROJECT workspace user là member (shape "channel" khớp FE).
@Controller('projects')
@UseGuards(AuthGuard)
export class ProjectsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  private map(w: any) {
    return { id: w.id, name: w.name, description: w.description, ownerId: w.ownerId, members: w.members.map((m: any) => m.userId) }
  }

  @Get()
  async findAll(@AuthUser() claims: AuthClaims) {
    const me = await this.users.resolveFromClaims(claims)
    const myIds = (await this.prisma.workspaceMember.findMany({ where: { userId: me.id }, select: { workspaceId: true } })).map((m) => m.workspaceId)
    const projects = await this.prisma.workspace.findMany({
      where: { type: 'project', archived: false, ...(me.role === 'admin' ? {} : { id: { in: myIds } }) },
      include: { members: { select: { userId: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return projects.map((w) => this.map(w))
  }

  // Chỉ owner (hoặc admin) được thêm/xóa member
  private async assertOwner(me: any, projectId: string) {
    const ws = await this.prisma.workspace.findUnique({ where: { id: projectId } })
    if (!ws || ws.type !== 'project') throw new NotFoundException('Không tìm thấy dự án')
    if (me.role === 'admin' || ws.ownerId === me.id) return ws
    const m = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: projectId, userId: me.id } } })
    if (m?.role === 'owner') return ws
    throw new ForbiddenException('Chỉ chủ dự án được quản lý thành viên')
  }

  // Tạo dự án — người tạo là owner, tự thêm làm member.
  @Post()
  async create(@AuthUser() claims: AuthClaims, @Body() dto: CreateProjectDto) {
    const me = await this.users.resolveFromClaims(claims)
    const ws = await this.prisma.workspace.create({
      data: {
        type: 'project', name: dto.name.trim(), description: dto.description ?? '', ownerId: me.id,
        members: { create: { userId: me.id, role: 'owner', addedById: me.id } },
      },
      include: { members: { select: { userId: true } } },
    })
    return this.map(ws)
  }

  @Patch(':id')
  async update(@AuthUser() claims: AuthClaims, @Param('id') id: string, @Body() dto: UpdateProjectDto) {
    const me = await this.users.resolveFromClaims(claims)
    await this.assertOwner(me, id)
    await this.prisma.workspace.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
      },
    })
    const ws = await this.prisma.workspace.findUnique({ where: { id }, include: { members: { select: { userId: true } } } })
    return this.map(ws)
  }

  @Post(':id/archive')
  async archive(@AuthUser() claims: AuthClaims, @Param('id') id: string) {
    const me = await this.users.resolveFromClaims(claims)
    await this.assertOwner(me, id)
    await this.prisma.workspace.update({ where: { id }, data: { archived: true } })
    return { archived: true }
  }

  @Post(':id/members')
  async addMember(@AuthUser() claims: AuthClaims, @Param('id') id: string, @Body() dto: AddMemberDto) {
    const me = await this.users.resolveFromClaims(claims)
    await this.assertOwner(me, id)
    await this.prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: id, userId: dto.userId } },
      create: { workspaceId: id, userId: dto.userId, role: 'member', addedById: me.id },
      update: {},
    })
    const ws = await this.prisma.workspace.findUnique({ where: { id }, include: { members: { select: { userId: true } } } })
    return this.map(ws)
  }

  @Delete(':id/members/:userId')
  async removeMember(@AuthUser() claims: AuthClaims, @Param('id') id: string, @Param('userId') userId: string) {
    const me = await this.users.resolveFromClaims(claims)
    const ws = await this.assertOwner(me, id)
    if (ws.ownerId === userId) throw new ForbiddenException('Không thể xóa chủ dự án khỏi thành viên')
    await this.prisma.workspaceMember.deleteMany({ where: { workspaceId: id, userId } })
    const out = await this.prisma.workspace.findUnique({ where: { id }, include: { members: { select: { userId: true } } } })
    return this.map(out)
  }
}
