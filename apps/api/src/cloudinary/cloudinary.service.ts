import { Injectable, BadRequestException } from "@nestjs/common";
import { UploadApiErrorResponse, UploadApiResponse, v2 as cloudinary } from "cloudinary";
import { Readable } from "stream";

@Injectable()
export class CloudinaryService {
  uploadFile(
    file: any,
    options?: { folder?: string },
  ): Promise<UploadApiResponse | UploadApiErrorResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: options?.folder ?? "accountflow",
        },
        (error, result) => {
          if (error) return reject(error);
          if (!result) return reject(new BadRequestException("Upload failed"));
          resolve(result);
        }
      );

      const readable = new Readable();
      readable._read = () => {};
      readable.push(file.buffer);
      readable.push(null);
      readable.pipe(uploadStream);
    });
  }

  async deleteAsset(publicId: string): Promise<void> {
    if (!publicId?.trim()) return;
    await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
      invalidate: true,
    });
  }
}
