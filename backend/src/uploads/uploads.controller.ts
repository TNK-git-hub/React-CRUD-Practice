import { BadRequestException, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';

// mimetype -> file extension (also the list of allowed types)
const EXTENSIONS: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
};
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB

@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
    constructor(private readonly config: ConfigService) { }

    // POST /uploads  (multipart/form-data, field name "file")
    @Post()
    @UseInterceptors(FileInterceptor('file', {
        storage: diskStorage({
            destination: './uploads', // multer creates the folder if it doesn't exist
            // random name + extension from the mimetype, never from the user's file name
            filename: (_req, file, cb) => cb(null, `${randomUUID()}${EXTENSIONS[file.mimetype]}`),
        }),
        limits: { fileSize: MAX_SIZE }, // too big -> 413 Payload Too Large
        fileFilter: (_req, file, cb) => {
            if (EXTENSIONS[file.mimetype]) cb(null, true);
            else cb(new BadRequestException('Only PNG, JPG or WEBP images are allowed'), false);
        },
    }))
    upload(@UploadedFile() file: Express.Multer.File) {
        if (!file) throw new BadRequestException('No file sent (field name must be "file")');
        return { url: `${this.config.get('PUBLIC_URL')}/uploads/${file.filename}` };
    }
}
