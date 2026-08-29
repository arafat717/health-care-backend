import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";
import { appointmentService } from "./appointment.service";

const appointment = catchAsync(async (req: Request, res: Response) => {
  const result = await appointmentService.bookAppointment();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Success",
    data: result,
  });
});
const appointmentCallback = catchAsync(async (req: Request, res: Response) => {
  const {redirectUrl, result} = await appointmentService.bookAppointmentCallback(req.query);
  console.log(result);
  res.redirect(redirectUrl!)
});

export const appointmentController = {
  appointment,
  appointmentCallback,
};
