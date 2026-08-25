import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { AuthController } from "./auth.controller";
import { UserValidation } from "./auth.validation";

const router = Router();

router.post(
  "/register",
  validateRequest(UserValidation.PatientRegistrationZodSchema),
  AuthController.registerPatient,
);
router.post(
  "/verify-mail",
  validateRequest(UserValidation.verifyMailOtpZodSchema),
  AuthController.verifyMail,
);
router.post(
  "/login",
  validateRequest(UserValidation.LoginZodSchema),
  AuthController.loginUser,
);
router.get(
  "/me",
  auth(Role.ADMIN, Role.DOCTOR, Role.PATIENT, Role.SUPER_ADMIN),
  // validateRequest
  AuthController.getMe,
);
router.post("/refresh-token", AuthController.refreshToken);
router.post(
  "/forgot-password",
  validateRequest(UserValidation.forgotPasswordZodSchema),
  AuthController.forgotPassword,
);
router.post(
  "/reset-password",
  validateRequest(UserValidation.resetPasswordZodSchema),
  AuthController.resetPassword,
);
router.post("/google", AuthController.googleLogin);
export const AuthRoutes = router;
