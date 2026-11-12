import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ToStrictBoolean, ToStrictNumber } from '../../../common/utils/strict-boolean';

export class UpsertAiSupportGroupDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(180) chatId!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(160) groupName!: string;
  @ApiProperty() @ToStrictBoolean() @IsBoolean() enabled!: boolean;
  @ApiPropertyOptional({ default: '/help' }) @IsOptional() @IsString() @MaxLength(32) trigger?: string;
  @ApiPropertyOptional({ default: 60, minimum: 0, maximum: 86400 }) @IsOptional() @ToStrictNumber() @IsInt() @Min(0) @Max(86400) cooldownSeconds?: number;
}

export class EnableAiSupportGroupsDto {
  @ApiProperty({ type: 'array', items: { type: 'object' } }) @IsArray() groups!: Array<{ chatId: string; groupName: string }>;
}

export class SaveAiKnowledgeArticleDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(180) title!: string;
  @ApiPropertyOptional({ default: 'General' }) @IsOptional() @IsString() @MaxLength(120) category?: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(4000) question!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(12000) answer!: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() keywords?: string[];
  @ApiPropertyOptional({ default: 'en' }) @IsOptional() @IsString() @MaxLength(24) language?: string;
  @ApiPropertyOptional({ default: false }) @IsOptional() @ToStrictBoolean() @IsBoolean() approved?: boolean;
  @ApiPropertyOptional({ default: true }) @IsOptional() @ToStrictBoolean() @IsBoolean() active?: boolean;
}
