import { UploadApiResponse } from "cloudinary";
import { cloudinary } from "../../lib/cloudinary";
import { prisma } from "../../lib/prisma";

const upateUserProfile = async (buffer: Buffer, userId: string) => {
  const currentUser = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      imagePubliceId: true,
      profileImage: true,
    },
  });

  const cloudinaryData = await new Promise<UploadApiResponse>(
    (resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: "auto",
          },
          async (error, result) => {
            if (error) {
              return reject(error);
            }

            if (!result) {
              return reject(new Error("No result return from Cloudinary"));
            }

            resolve(result);
          },
        )
        .end(buffer);
    },
  );
  const user = await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      profileImage: cloudinaryData?.secure_url,
      imagePubliceId: cloudinaryData?.public_id,
    },
    omit: {
      password: true,
    },
  });

  if (currentUser?.imagePubliceId && currentUser.profileImage) {
    await cloudinary.uploader.destroy(currentUser.imagePubliceId);
  }

  return user;
};

export const userService = {
  upateUserProfile,
};
