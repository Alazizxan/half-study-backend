import { IsUUID, IsInt, Min } from 'class-validator';

export class TransferDto {
  @IsUUID()
  toUserId: string;

  @IsInt()
  @Min(1)
  amount: number;
}
