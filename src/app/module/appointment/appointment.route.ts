import { Router } from "express";
import { appointmentController } from "./appointment.controller";

const router = Router();

router.post("/book-appointment", appointmentController.appointment);
router.get(
  "/book-appointment/payment/callback",
  appointmentController.appointmentCallback,
);
export const appointmentRouter = router;
