import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';

@Injectable()
export class TestService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async resetDatabase(): Promise<{ reset: true; database: string }> {
    const database = this.connection.name;
    await this.connection.dropDatabase();
    return { reset: true, database };
  }
}
