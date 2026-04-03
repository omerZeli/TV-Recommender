import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';

const SALT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async create(name: string, email: string, password: string, country?: string): Promise<User> {
    const existing = await this.usersRepo.findOneBy({ email });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    const user = this.usersRepo.create({ name, email, password: hashed, country });
    return this.usersRepo.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne();
  }

  async findById(id: number): Promise<User> {
    const user = await this.usersRepo.findOneBy({ id });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(
    id: number,
    data: { name?: string; email?: string; password?: string; country?: string },
  ): Promise<User> {
    const user = await this.findById(id);

    if (data.email && data.email !== user.email) {
      const existing = await this.usersRepo.findOneBy({ email: data.email });
      if (existing) throw new ConflictException('Email already registered');
      user.email = data.email;
    }

    if (data.name) user.name = data.name;
    if (data.password) user.password = await bcrypt.hash(data.password, SALT_ROUNDS);
    if (data.country !== undefined) user.country = data.country;

    return this.usersRepo.save(user);
  }
}
