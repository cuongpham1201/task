import { Controller, Get, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../auth/auth.guard'
import { AuthUser } from '../auth/current-user.decorator'
import type { AuthClaims } from '../auth/auth.types'
import { PrismaService } from '../prisma/prisma.service'
import { UsersService } from '../users/users.service'
import { VisibilityService } from '../common/visibility.service'

// Phòng/ban (org_unit type=department) mà user được xem.
@Controller('departments')
@UseGuards(AuthGuard)
export class DepartmentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly vis: VisibilityService,
  ) {}

  @Get()
  async findAll(@AuthUser() claims: AuthClaims) {
    const me = await this.users.resolveFromClaims(claims)
    const visible = await this.vis.visibleOrgUnitIds(me)
    const units = await this.prisma.orgUnit.findMany({
      where: { type: 'department', active: true },
      orderBy: { sortOrder: 'asc' },
    })
    return units
      .filter((o) => me.role === 'admin' || visible.includes(o.id))
      .map((o) => ({ id: o.id, name: o.name, code: o.code, blockId: o.parentId, legalEntity: o.legalEntity }))
  }
}
