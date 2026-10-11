import { Controller, Delete, UseGuards } from '@nestjs/common';
import { ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TestEnvGuard } from './test-env.guard.js';
import { TestService } from './test.service.js';

@ApiTags('test')
@Controller('apo/test')
@UseGuards(TestEnvGuard)
export class TestController {
  constructor(private readonly testService: TestService) {}

  @Delete('reset')
  @ApiOperation({ summary: 'Restablecer (borrar) toda la base de datos' })
  @ApiOkResponse({ description: 'Base de datos borrada con éxito' })
  @ApiForbiddenResponse({ description: 'No permitido en el entorno actual (solo dev/qa)' })
  reset() {
    return this.testService.resetDatabase();
  }
}
