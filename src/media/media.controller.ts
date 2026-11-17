import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import { StorageService } from 'src/common/services/storage.service';

@Controller('media')
export class MediaController {
  constructor(private storage: StorageService) {}

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File) {
    const result = await this.storage.upload(file.buffer, 'whatsapp-image', {
      fileName: file.originalname,
      contentType: file.mimetype,
    });

    return {
      uri: result.url,
      publicId: result.path,
    };
  }
}
