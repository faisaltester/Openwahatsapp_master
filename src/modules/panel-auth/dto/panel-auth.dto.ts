import { IsArray, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { PanelUserRole } from '../entities/panel-user.entity';

export class PanelLoginDto {
  @IsString() @MinLength(3) @MaxLength(80) username!: string;
  @IsString() @MinLength(3) @MaxLength(200) password!: string;
}

export class CreatePanelUserDto {
  @IsString() @Matches(/^[a-zA-Z0-9._-]{3,80}$/) username!: string;
  @IsString() @MinLength(3) @MaxLength(200) password!: string;
  @IsOptional() @IsString() @MaxLength(120) displayName?: string;
  @IsEnum(PanelUserRole) role!: PanelUserRole;
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) sessionIds?: string[];
}

export class ReplacePanelUserSessionsDto {
  @IsArray() @IsUUID('4', { each: true }) sessionIds!: string[];
}

export class CreateCreditEntryDto {
  @IsUUID() userId!: string;
  @IsInt() amount!: number;
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
  @IsOptional() @IsUUID() sessionId?: string;
}
