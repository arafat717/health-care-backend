import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";
import { appointmentService } from "./appointment.service";

const appointment = catchAsync(async (req: Request, res: Response) => {
  const payload = req.body;
  const user = req.user!;
  const result = await appointmentService.bookAppointment(payload, user);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Success",
    data: result,
  });
});

const appointmentCallback = catchAsync(async (req: Request, res: Response) => {
  const { redirectUrl } = await appointmentService.bookAppointmentCallback(
    req.query,
  );
  res.redirect(redirectUrl!);
});

const payAppointment = catchAsync(async (req: Request, res: Response) => {
  const payload = req.body;
  const user = req.user!;
  const { paymentUrl } = await appointmentService.payAppointment(payload, user);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Bkash initial successfully!",
    data: paymentUrl,
  });
});

const cancelAppointment = catchAsync(async (req: Request, res: Response) => {
  const payload = req.body;
  const result = await appointmentService.cancelAppointment(payload);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Appointment cancel successfully!",
    data: result,
  });
});

export const appointmentController = {
  appointment,
  appointmentCallback,
  payAppointment,
  cancelAppointment,
};
