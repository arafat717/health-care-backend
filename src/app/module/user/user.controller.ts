import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";
import { userService } from "./user.service";

const updateProfile = catchAsync(async (req: Request, res: Response) => {
  const buffer = req.file?.buffer;

  if (!buffer) {
    throw new Error("File not uploaded");
  }

  const result = await userService.upateUserProfile(
    buffer,
    req.user?.userId as string,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User profile updated successfully",
    data: result,
  });
});

export const userController = {
  updateProfile,
};
